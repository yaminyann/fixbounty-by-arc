import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { adminEmail, requireAdmin, requireAuth } from '../auth.js'
import { config } from '../config.js'
import { readTreasuryBalance, publicClient } from '../chain.js'
import { pool, query } from '../db.js'
import { HttpError, clampInt, parse, parseOnchainId, queryString, route } from '../lib/http.js'
import { TtlCache } from '../lib/limits.js'
import { indexerStatus } from '../services/indexer.js'
import { BOUNTY_LIST_COLUMNS, toTsQuery } from '../services/projections.js'
import { notify } from '../services/notify.js'
import { notifySavedSearches } from '../services/alerts.js'
import { describeEvent, emitProjectEvent } from '../services/webhooks.js'

export const adminRouter = Router()

// Admin access is the verified Google account on the server-side allowlist (ADMIN_EMAILS).
adminRouter.use(requireAuth, requireAdmin)
adminRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  next()
})

adminRouter.get(
  '/me',
  route((req: Request, res: Response) => {
    res.json({ email: req.user!.email, displayName: req.user!.displayName })
  }),
)

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const treasuryCache = new TtlCache<string>(30_000, 1)
const overviewCache = new TtlCache<Record<string, unknown>>(10_000, 1)

adminRouter.get(
  '/overview',
  route(async (_req: Request, res: Response) => {
    const data = await overviewCache.get('overview', async () => {
      const [moderation, chainStatus, people, work, revenue, byKind, revenueDaily, bountiesDaily] = await Promise.all([
        query<{ pending: number; approved: number; rejected: number; unpublished: number }>(
          `SELECT
             COUNT(*) FILTER (WHERE metadata_verified AND moderation_status = 'pending')::int AS pending,
             COUNT(*) FILTER (WHERE moderation_status = 'approved')::int AS approved,
             COUNT(*) FILTER (WHERE moderation_status = 'rejected')::int AS rejected,
             COUNT(*) FILTER (WHERE NOT metadata_verified)::int AS unpublished
           FROM bounties`,
        ),
        query<{ status: number; count: number; reward: string }>(
          `SELECT onchain_status AS status, COUNT(*)::int AS count, COALESCE(SUM(reward_amount), 0)::text AS reward
             FROM bounties GROUP BY onchain_status ORDER BY onchain_status`,
        ),
        query<{ users: number; new7d: number; wallets: number }>(
          `SELECT (SELECT COUNT(*)::int FROM users) AS users,
                  (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS new7d,
                  (SELECT COUNT(*)::int FROM wallets WHERE verified) AS wallets`,
        ),
        query<{ submissions: number; winners: number }>(
          `SELECT COUNT(*)::int AS submissions, COUNT(*) FILTER (WHERE position IS NOT NULL)::int AS winners FROM submissions`,
        ),
        query<{ total: string; day: string; week: string; month: string }>(
          `SELECT COALESCE(SUM(amount), 0)::text AS total,
                  COALESCE(SUM(amount) FILTER (WHERE block_time > NOW() - INTERVAL '1 day'), 0)::text AS day,
                  COALESCE(SUM(amount) FILTER (WHERE block_time > NOW() - INTERVAL '7 days'), 0)::text AS week,
                  COALESCE(SUM(amount) FILTER (WHERE block_time > NOW() - INTERVAL '30 days'), 0)::text AS month
             FROM platform_fees`,
        ),
        query<{ kind: number; total: string; count: number }>(
          `SELECT kind, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::int AS count FROM platform_fees GROUP BY kind ORDER BY kind`,
        ),
        query<{ day: string; amount: string }>(
          `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(SUM(f.amount), 0)::text AS amount
             FROM generate_series(date_trunc('day', NOW()) - INTERVAL '13 days', date_trunc('day', NOW()), INTERVAL '1 day') AS d(day)
             LEFT JOIN platform_fees f ON date_trunc('day', f.block_time) = d.day
            GROUP BY d.day ORDER BY d.day`,
        ),
        query<{ day: string; count: number }>(
          `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(b.id)::int AS count
             FROM generate_series(date_trunc('day', NOW()) - INTERVAL '13 days', date_trunc('day', NOW()), INTERVAL '1 day') AS d(day)
             LEFT JOIN bounties b ON date_trunc('day', b.created_at) = d.day
            GROUP BY d.day ORDER BY d.day`,
        ),
      ])

      let treasuryBalance: string | null = null
      try {
        treasuryBalance = await treasuryCache.get('balance', async () => (await readTreasuryBalance()).toString())
      } catch {
        treasuryBalance = null
      }

      return {
        moderation: moderation.rows[0],
        chainStatus: chainStatus.rows,
        people: people.rows[0],
        work: work.rows[0],
        revenue: { ...revenue.rows[0], byKind: byKind.rows, treasuryBalance, treasuryAddress: config.chain.treasuryAddress },
        series: { revenue: revenueDaily.rows, bounties: bountiesDaily.rows },
      }
    })
    res.json(data)
  }),
)

// ---------------------------------------------------------------------------
// Bounties and moderation
// ---------------------------------------------------------------------------

adminRouter.get(
  '/bounties',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const moderation = queryString(req.query.moderation, 12) ?? 'pending'
    const status = queryString(req.query.status, 3)
    const search = queryString(req.query.search, 80)

    const where: string[] = []
    const params: unknown[] = []

    if (moderation === 'unpublished') {
      where.push('NOT b.metadata_verified')
    } else if (moderation !== 'all') {
      if (!['pending', 'approved', 'rejected'].includes(moderation)) throw new HttpError(400, 'Invalid moderation filter')
      params.push(moderation)
      where.push(`b.moderation_status = $${params.length} AND b.metadata_verified`)
    }
    if (status !== undefined && /^[0-5]$/.test(status)) {
      params.push(Number(status))
      where.push(`b.onchain_status = $${params.length}`)
    }
    if (search) {
      const ts = toTsQuery(search)
      params.push(`%${search.toLowerCase()}%`)
      const likeIdx = params.length
      if (ts) {
        params.push(ts)
        where.push(`(b.search_tsv @@ to_tsquery('simple', $${params.length}) OR b.creator_wallet LIKE $${likeIdx} OR LOWER(u.email) LIKE $${likeIdx})`)
      } else {
        where.push(`(b.creator_wallet LIKE $${likeIdx} OR LOWER(u.email) LIKE $${likeIdx})`)
      }
    }
    params.push(limit, offset)

    const rows = await query<{ total: string }>(
      `SELECT ${BOUNTY_LIST_COLUMNS},
              b.description, b.acceptance_criteria AS "acceptanceCriteria", b.links, b.content_hash AS "contentHash",
              b.metadata_verified AS "metadataVerified", b.moderation_note AS "moderationNote",
              b.moderated_by AS "moderatedBy", b.moderated_at AS "moderatedAt", b.tx_hash AS "txHash",
              u.email AS "creatorEmail", u.display_name AS "creatorName",
              COUNT(*) OVER()::text AS total
         FROM bounties b
         LEFT JOIN users u ON u.id = b.creator_user_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${moderation === 'pending' ? 'b.created_at ASC' : 'b.created_at DESC'}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

const ModerationSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'pending']),
  note: z.string().trim().max(500).optional(),
})

adminRouter.post(
  '/bounties/:id/moderation',
  route(async (req: Request, res: Response) => {
    const onchainId = parseOnchainId(req.params.id)
    const { decision, note } = parse(ModerationSchema, req.body)
    const contract = config.chain.contractAddress
    if (!contract) throw new HttpError(503, 'Contract is not configured.')

    const current = await query<{ id: string; metadata_verified: boolean; onchain_status: number; moderation_status: string }>(
      'SELECT id, metadata_verified, onchain_status, moderation_status FROM bounties WHERE contract_address = $1 AND onchain_id = $2',
      [contract, onchainId],
    )
    const bounty = current.rows[0]
    if (!bounty) throw new HttpError(404, 'Bounty not found')

    if (decision === 'approved') {
      if (!bounty.metadata_verified) throw new HttpError(409, 'The creator has not published a verified description yet.')
      if (bounty.onchain_status === 0) throw new HttpError(409, 'This bounty is not funded on-chain yet.')
      if (bounty.onchain_status === 5) throw new HttpError(409, 'This bounty was cancelled.')
    }
    if (decision === 'rejected' && !note) throw new HttpError(400, 'Add a short reason so the creator knows what to change.')

    const email = adminEmail(req)
    await query(
      `UPDATE bounties
          SET moderation_status = $2, moderated_by = $3, moderated_at = NOW(), moderation_note = $4, updated_at = NOW()
        WHERE id = $1`,
      [bounty.id, decision, email, note ?? null],
    )
    await query(
      `INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, detail)
       VALUES ($1, $2, 'bounty', $3, $4)`,
      [email, `moderation.${decision}`, String(onchainId), JSON.stringify({ from: bounty.moderation_status, note: note ?? null })],
    )

    if (decision !== 'pending') {
      const owner = await query<{ creator_user_id: string | null; title: string }>('SELECT creator_user_id, title FROM bounties WHERE id = $1', [bounty.id])
      await notify({
        userId: owner.rows[0]?.creator_user_id,
        kind: decision === 'approved' ? 'bounty_approved' : 'bounty_rejected',
        title: decision === 'approved' ? 'Your bounty is live' : 'Your bounty was not approved',
        body: decision === 'rejected' ? `${owner.rows[0]?.title}: ${note}` : (owner.rows[0]?.title ?? ''),
        link: `/bounty/${onchainId}`,
      })
    }

    if (decision === 'approved') {
      void notifySavedSearches(bounty.id)
      const live = await query<{ title: string; reward_amount: string }>('SELECT title, reward_amount::text AS reward_amount FROM bounties WHERE id = $1', [bounty.id])
      if (live.rows[0]) void emitProjectEvent(bounty.id, 'bounty_live', describeEvent('bounty_live', live.rows[0].title, onchainId, { amount: live.rows[0].reward_amount }))
    }

    res.json({ onchainId, moderationStatus: decision })
  }),
)

// ---------------------------------------------------------------------------
// Categories and projects
// ---------------------------------------------------------------------------

adminRouter.get(
  '/categories',
  route(async (_req: Request, res: Response) => {
    const rows = await query(
      `SELECT c.slug, c.name, c.description, c.icon, c.examples, c.sort_order AS "sortOrder", c.active,
              (SELECT COUNT(*)::int FROM bounties b WHERE b.category = c.slug) AS "bountyCount"
         FROM categories c ORDER BY c.sort_order, c.name`,
    )
    res.json({ items: rows.rows })
  }),
)

const CategorySchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Use letters, numbers and hyphens'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).default(''),
  icon: z.enum(['shield-check', 'code', 'palette', 'telescope', 'users', 'flask-conical', 'megaphone', 'book-open', 'globe', 'cpu', 'layers', 'sparkles']).default('code'),
  examples: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
  active: z.boolean().default(true),
})

adminRouter.post(
  '/categories',
  route(async (req: Request, res: Response) => {
    const c = parse(CategorySchema, req.body)
    await query(
      `INSERT INTO categories (slug, name, description, icon, examples, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
         examples = EXCLUDED.examples, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active`,
      [c.slug, c.name, c.description, c.icon, c.examples, c.sortOrder, c.active],
    )
    await query(`INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, detail) VALUES ($1, 'category.save', 'category', $2, $3)`, [
      adminEmail(req),
      c.slug,
      JSON.stringify({ name: c.name, active: c.active }),
    ])
    res.json({ ok: true })
  }),
)

adminRouter.get(
  '/projects',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const rows = await query<{ total: string }>(
      `SELECT p.id, p.slug, p.name, p.status, p.owner_wallet AS "ownerWallet", u.email AS "ownerEmail", p.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id) AS "bountyCount", COUNT(*) OVER()::text AS total
         FROM projects p LEFT JOIN users u ON u.id = p.owner_user_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

adminRouter.post(
  '/projects/:slug/status',
  route(async (req: Request, res: Response) => {
    const { status } = parse(z.object({ status: z.enum(['active', 'hidden']) }), req.body)
    const slug = String(req.params.slug).toLowerCase()
    const updated = await query('UPDATE projects SET status = $2, updated_at = NOW() WHERE slug = $1 RETURNING id', [slug, status])
    if (updated.rowCount === 0) throw new HttpError(404, 'Project not found')
    await query(`INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, detail) VALUES ($1, $2, 'project', $3, '{}'::jsonb)`, [adminEmail(req), `project.${status}`, slug])
    res.json({ slug, status })
  }),
)

// ---------------------------------------------------------------------------
// Submissions, users, revenue, activity, audit, system
// ---------------------------------------------------------------------------

adminRouter.get(
  '/submissions',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const search = queryString(req.query.search, 80)?.toLowerCase()

    const params: unknown[] = []
    let where = ''
    if (search) {
      params.push(`%${search}%`)
      where = `WHERE s.submitter_wallet LIKE $1 OR LOWER(b.title) LIKE $1 OR LOWER(COALESCE(su.email, '')) LIKE $1`
    }
    params.push(limit, offset)

    const rows = await query<{ total: string }>(
      `SELECT s.id, s.submitter_wallet AS "submitterWallet", s.description, s.pull_request_url AS "pullRequestUrl",
              s.notes_verified AS "notesVerified", s.position, s.tx_hash AS "txHash", s.created_at AS "createdAt",
              b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus",
              su.email AS "submitterEmail", su.display_name AS "submitterName",
              COUNT(*) OVER()::text AS total
         FROM submissions s
         JOIN bounties b ON b.id = s.bounty_id
         LEFT JOIN users su ON su.id = COALESCE(s.submitter_user_id, (SELECT user_id FROM wallets WHERE address = s.submitter_wallet))
        ${where}
        ORDER BY s.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

adminRouter.get(
  '/users',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const search = queryString(req.query.search, 80)?.toLowerCase()

    const params: unknown[] = []
    let where = ''
    if (search) {
      params.push(`%${search}%`)
      where = `WHERE LOWER(COALESCE(u.email, '')) LIKE $1 OR LOWER(COALESCE(u.display_name, '')) LIKE $1 OR COALESCE(w.address, '') LIKE $1`
    }
    params.push(limit, offset)

    const rows = await query<{ total: string }>(
      `SELECT u.id, u.email, u.display_name AS "displayName", u.photo_url AS "photoUrl", u.created_at AS "createdAt",
              u.last_seen_at AS "lastSeenAt", w.address AS wallet,
              (SELECT COUNT(*)::int FROM bounties b WHERE b.creator_user_id = u.id) AS bounties,
              (SELECT COUNT(*)::int FROM submissions s WHERE s.submitter_user_id = u.id) AS submissions,
              COUNT(*) OVER()::text AS total
         FROM users u
         LEFT JOIN wallets w ON w.user_id = u.id AND w.verified
        ${where}
        ORDER BY u.last_seen_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

adminRouter.get(
  '/revenue',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const kind = queryString(req.query.kind, 1)

    const params: unknown[] = []
    let where = ''
    if (kind === '0' || kind === '1') {
      params.push(Number(kind))
      where = 'WHERE f.kind = $1'
    }
    params.push(limit, offset)

    const rows = await query<{ total: string }>(
      `SELECT f.id, f.kind, f.amount::text AS amount, f.payer_wallet AS "payerWallet", f.tx_hash AS "txHash",
              f.block_time AS "time", f.onchain_id::int AS "onchainId", b.title AS "bountyTitle",
              COUNT(*) OVER()::text AS total
         FROM platform_fees f
         JOIN bounties b ON b.id = f.bounty_id
        ${where}
        ORDER BY f.block_time DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

adminRouter.get(
  '/activity',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 30, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const rows = await query<{ total: string }>(
      `SELECT a.id, a.onchain_id::int AS "onchainId", a.kind, a.actor_wallet AS "actorWallet", a.position,
              a.amount::text AS amount, a.fee::text AS fee, a.tx_hash AS "txHash", a.block_time AS "time",
              b.title AS "bountyTitle", b.moderation_status AS "moderationStatus", COUNT(*) OVER()::text AS total
         FROM bounty_activity a
         JOIN bounties b ON b.id = a.bounty_id
        ORDER BY a.block_time DESC, a.log_index DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

adminRouter.get(
  '/audit',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 30, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const rows = await query<{ total: string }>(
      `SELECT id, admin_email AS "adminEmail", action, target_type AS "targetType", target_id AS "targetId",
              detail, created_at AS "createdAt", COUNT(*) OVER()::text AS total
         FROM admin_audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

adminRouter.get(
  '/system',
  route(async (_req: Request, res: Response) => {
    const dbStart = Date.now()
    await pool.query('SELECT 1')
    const dbLatencyMs = Date.now() - dbStart

    let latestBlock: number | null = null
    let rpcLatencyMs: number | null = null
    try {
      const rpcStart = Date.now()
      latestBlock = Number(await publicClient.getBlockNumber())
      rpcLatencyMs = Date.now() - rpcStart
    } catch {
      latestBlock = null
    }

    res.json({
      network: { chainId: config.chain.id, rpcUrl: config.chain.rpcUrl, explorerUrl: config.chain.explorerUrl },
      contract: config.chain.contractAddress,
      usdc: config.chain.usdcAddress,
      treasury: config.chain.treasuryAddress,
      database: { latencyMs: dbLatencyMs, poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount },
      rpc: { latestBlock, latencyMs: rpcLatencyMs },
      indexer: {
        ...indexerStatus,
        lagBlocks: latestBlock !== null && indexerStatus.lastBlock !== null ? Math.max(latestBlock - indexerStatus.lastBlock, 0) : null,
      },
      admins: config.adminEmails,
    })
  }),
)

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { query } from '../db.js'
import { isAdminUser, optionalAuth, requireAuth, requireLinkedWallet, getLinkedWallet } from '../auth.js'
import { readBounty, readSubmissionHash } from '../chain.js'
import { HttpError, clampInt, parse, parseOnchainId, queryString, route } from '../lib/http.js'
import { TtlCache, rateLimit } from '../lib/limits.js'
import { BountyMetadataSchema, SubmissionMetadataSchema, bountyCommitment, submissionCommitment } from '../lib/metadata.js'
import { syncBounty, upsertChainBounty } from '../services/bountySync.js'
import { nudgeIndexer } from '../services/indexer.js'
import { DIFFICULTIES, ListingSchema, SLUG_RE, isBountyCreator, likePattern, loadBountyAccess, resolveListing } from '../lib/ecosystem.js'
import {
  BOUNTY_DETAIL_COLUMNS,
  BOUNTY_DETAIL_FROM,
  BOUNTY_LIST_COLUMNS,
  DEFAULT_PUBLIC_STATUSES,
  SUBMISSION_COLUMNS,
  toTsQuery,
} from '../services/projections.js'

export const bountiesRouter = Router()

const listCache = new TtlCache<{ items: unknown[]; total: number }>(3_000)

const SORTS: Record<string, string> = {
  newest: 'b.created_at DESC',
  reward: 'b.reward_amount DESC, b.created_at DESC',
  deadline: 'b.deadline ASC',
  popular: 'b.submission_count DESC, b.created_at DESC',
}

// ---------------------------------------------------------------------------
// Public listing (only admin-approved bounties)
// ---------------------------------------------------------------------------

bountiesRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 12, 1, 50)
    const offset = clampInt(req.query.offset, 0, 0, 100_000)
    const sort = SORTS[queryString(req.query.sort, 20) ?? 'newest'] ?? SORTS.newest
    const search = queryString(req.query.search, 80)
    const statusParam = queryString(req.query.status, 20)
    const openOnly = req.query.open === '1' || req.query.open === 'true'
    const creator = queryString(req.query.creator, 42)?.toLowerCase()
    const state = queryString(req.query.state, 16)
    const category = queryString(req.query.category, 40)?.toLowerCase()
    const difficulty = queryString(req.query.difficulty, 12)?.toLowerCase()
    const projectSlug = queryString(req.query.project, 40)?.toLowerCase()
    const mode = queryString(req.query.mode, 8)?.toLowerCase()
    const skill = queryString(req.query.skill, 32)?.toLowerCase()
    const minReward = clampInt(req.query.minReward, 0, 0, 1_000_000_000)
    const maxReward = clampInt(req.query.maxReward, 0, 0, 1_000_000_000)
    const deadlineWithin = clampInt(req.query.deadlineWithin, 0, 0, 366)

    const statuses = statusParam
      ? statusParam
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 5)
      : DEFAULT_PUBLIC_STATUSES

    const cacheKey = JSON.stringify([limit, offset, sort, search, statuses, openOnly, creator, state, category, difficulty, projectSlug, mode, skill, minReward, maxReward, deadlineWithin])
    const result = await listCache.get(cacheKey, async () => {
      const params: unknown[] = [statuses.length > 0 ? statuses : DEFAULT_PUBLIC_STATUSES]
      let where = `b.moderation_status = 'approved' AND b.metadata_verified AND b.onchain_status = ANY($1::int[])`

      if (openOnly) where += ` AND b.onchain_status = 1 AND b.deadline > NOW()`

      // Marketplace states replace the raw status list (parameter $1 stays referenced so the query shape is stable).
      const base = `b.moderation_status = 'approved' AND b.metadata_verified AND $1::int[] IS NOT NULL`
      if (state === 'open') where = `${base} AND b.onchain_status = 1 AND b.deadline > NOW()`
      else if (state === 'in_progress') where = `${base} AND ((b.onchain_status = 1 AND b.deadline <= NOW()) OR b.onchain_status = 2)`
      else if (state === 'completed') where = `${base} AND b.onchain_status = 3`
      else if (state === 'cancelled') where = `${base} AND b.onchain_status IN (4, 5)`

      if (category && /^[a-z0-9-]{1,40}$/.test(category)) {
        params.push(category)
        where += ` AND b.category = $${params.length}`
      }
      if (difficulty && (DIFFICULTIES as readonly string[]).includes(difficulty)) {
        params.push(difficulty)
        where += ` AND b.difficulty = $${params.length}`
      }
      if (mode === 'solo' || mode === 'team') {
        params.push(mode)
        where += ` AND b.work_mode = $${params.length}`
      }
      if (projectSlug && SLUG_RE.test(projectSlug)) {
        params.push(projectSlug)
        where += ` AND b.project_id = (SELECT id FROM projects WHERE slug = $${params.length} AND status = 'active')`
      }
      if (skill) {
        params.push(skill)
        where += ` AND ($${params.length} = ANY(b.skills) OR $${params.length} = ANY(b.tags))`
      }
      if (minReward > 0) {
        params.push(String(BigInt(minReward) * 1_000_000n))
        where += ` AND b.reward_amount >= $${params.length}::bigint`
      }
      if (maxReward > 0) {
        params.push(String(BigInt(maxReward) * 1_000_000n))
        where += ` AND b.reward_amount <= $${params.length}::bigint`
      }
      if (deadlineWithin > 0) {
        params.push(deadlineWithin)
        where += ` AND b.deadline > NOW() AND b.deadline <= NOW() + ($${params.length}::int * INTERVAL '1 day')`
      }
      if (creator && /^0x[0-9a-f]{40}$/.test(creator)) {
        params.push(creator)
        where += ` AND b.creator_wallet = $${params.length}`
      }

      const tsQuery = toTsQuery(search)
      if (tsQuery && search) {
        params.push(tsQuery)
        const tsIdx = params.length
        params.push(search.toLowerCase())
        const tagIdx = params.length
        params.push(likePattern(search.toLowerCase()))
        where += ` AND (b.search_tsv @@ to_tsquery('simple', $${tsIdx}) OR $${tagIdx} = ANY(b.tags) OR $${tagIdx} = ANY(b.skills)
          OR b.project_id IN (SELECT p.id FROM projects p WHERE p.status = 'active' AND LOWER(p.name) LIKE $${params.length}))`
      }

      params.push(limit, offset)
      const rows = await query<{ total: string }>(
        `SELECT ${BOUNTY_LIST_COLUMNS}, COUNT(*) OVER()::text AS total
           FROM bounties b
          WHERE ${where}
          ORDER BY ${sort}
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
      const items = rows.rows.map(({ total: _t, ...rest }) => rest)
      return { items, total }
    })

    res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=15')
    res.json({ ...result, limit, offset })
  }),
)

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

interface DetailRow {
  id: string
  creatorWallet: string
  creatorUserId: string | null
  moderationStatus: string
  metadataVerified: boolean
  moderationNote: string | null
  [key: string]: unknown
}

async function loadBountyRow(onchainId: number): Promise<DetailRow | null> {
  const contract = config.chain.contractAddress
  if (!contract) return null
  const res = await query<DetailRow>(
    `SELECT ${BOUNTY_DETAIL_COLUMNS} ${BOUNTY_DETAIL_FROM} WHERE b.contract_address = $1 AND b.onchain_id = $2`,
    [contract, onchainId],
  )
  return res.rows[0] ?? null
}

/** Public once approved; creators and admins can always see their view of it. */
async function canView(req: Request, bounty: DetailRow): Promise<boolean> {
  if (bounty.moderationStatus === 'approved' && bounty.metadataVerified) return true
  if (!req.user) return false
  if (isAdminUser(req.user)) return true
  if (bounty.creatorUserId === req.user.id) return true
  const wallet = await getLinkedWallet(req.user.id)
  return wallet !== null && wallet === bounty.creatorWallet
}

bountiesRouter.get(
  '/:id',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const id = parseOnchainId(req.params.id)
    const bounty = await loadBountyRow(id)
    if (!bounty || !(await canView(req, bounty))) throw new HttpError(404, 'Bounty not found')

    const viewerIsOwner = req.user ? bounty.creatorUserId === req.user.id : false
    const publiclyVisible = bounty.moderationStatus === 'approved'
    // Moderation notes are only for the creator and admins.
    const payload = viewerIsOwner || isAdminUser(req.user) ? bounty : { ...bounty, moderationNote: null }

    res.setHeader('Cache-Control', publiclyVisible && !req.user ? 'public, max-age=3, stale-while-revalidate=15' : 'private, no-store')
    res.json({ bounty: payload })
  }),
)

// ---------------------------------------------------------------------------
// Registering metadata for a bounty created on-chain
// ---------------------------------------------------------------------------

const CreateBountySchema = BountyMetadataSchema.extend({
  onchainId: z.number().int().positive().max(2_147_483_647),
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
  /** Listing details live beside the bounty and are not part of the on-chain content hash. */
  listing: ListingSchema.optional(),
})

bountiesRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 12, key: (req) => req.ip ?? 'anon' }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const { onchainId, txHash, listing, ...meta } = parse(CreateBountySchema, req.body)
    const user = req.user!
    const wallet = req.wallet!
    const details = listing ? await resolveListing(listing, user.id) : null

    const chain = await readBounty(onchainId)
    if (!chain) throw new HttpError(409, 'Bounty not found on-chain yet. Wait for the transaction to confirm and retry.')
    if (chain.creator !== wallet) throw new HttpError(403, 'Only the on-chain creator can publish this bounty.')
    if (chain.title !== meta.title) throw new HttpError(422, 'Title does not match the on-chain bounty.')
    if (chain.contentHash !== bountyCommitment(meta)) {
      throw new HttpError(422, 'Description does not match the hash committed on-chain.')
    }

    const rowId = await upsertChainBounty(chain)

    const updated = await query(
      `UPDATE bounties
          SET description = $2, acceptance_criteria = $3, tags = $4, links = $5,
              metadata_verified = TRUE, creator_user_id = $6, tx_hash = COALESCE($7, tx_hash), updated_at = NOW()
        WHERE id = $1 AND (metadata_verified = FALSE OR creator_user_id = $6)
        RETURNING id`,
      [rowId, meta.description, meta.acceptanceCriteria, [...new Set(meta.tags)], [...new Set(meta.links)], user.id, txHash ?? null],
    )
    if (updated.rowCount === 0) throw new HttpError(409, 'This bounty was already published by another account.')
    if (details) await writeListing(rowId, details)

    nudgeIndexer()
    const bounty = await loadBountyRow(onchainId)
    res.status(201).json({ bounty })
  }),
)

async function writeListing(rowId: string, d: Awaited<ReturnType<typeof resolveListing>>): Promise<void> {
  await query(
    `UPDATE bounties
        SET category = $2, difficulty = $3, skills = $4, work_mode = $5, project_id = $6, recurring_program_id = $7,
            submission_instructions = $8, eligibility = $9, updated_at = NOW()
      WHERE id = $1`,
    [rowId, d.category, d.difficulty, d.skills, d.workMode, d.projectId, d.recurringProgramId, d.submissionInstructions, d.eligibility],
  )
  listCache.invalidate()
}

// The creator can adjust how the bounty is listed (category, project, difficulty, team mode). The hashed text stays fixed.
bountiesRouter.post(
  '/:id/listing',
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const id = parseOnchainId(req.params.id)
    const listing = parse(ListingSchema, req.body)
    const bounty = await loadBountyAccess(id)
    if (!isBountyCreator(req, bounty)) throw new HttpError(403, 'Only the creator can change how this bounty is listed.')
    if (bounty.work_mode === 'team' && listing.workMode === 'solo') {
      const members = await query('SELECT 1 FROM bounty_team_members WHERE bounty_id = $1 AND status = $2 LIMIT 1', [bounty.id, 'active'])
      if ((members.rowCount ?? 0) > 0) throw new HttpError(409, 'Remove the team members before switching back to a solo bounty.')
    }
    await writeListing(bounty.id, await resolveListing(listing, req.user!.id))
    res.json({ ok: true })
  }),
)

// ---------------------------------------------------------------------------
// Refresh a bounty from the chain right after a transaction
// ---------------------------------------------------------------------------

const lastRefresh = new Map<number, number>()

bountiesRouter.post(
  '/:id/refresh',
  rateLimit({ windowMs: 60_000, max: 60 }),
  route(async (req: Request, res: Response) => {
    const id = parseOnchainId(req.params.id)
    const now = Date.now()
    if (now - (lastRefresh.get(id) ?? 0) < 1_500) {
      res.json({ refreshed: false })
      return
    }
    lastRefresh.set(id, now)
    if (lastRefresh.size > 2_000) lastRefresh.clear()

    const synced = await syncBounty(id)
    if (!synced) throw new HttpError(404, 'Bounty not found on-chain')
    listCache.invalidate()
    nudgeIndexer()
    res.json({ refreshed: true, status: synced.chain.status })
  }),
)

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

bountiesRouter.get(
  '/:id/submissions',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const id = parseOnchainId(req.params.id)
    const bounty = await loadBountyRow(id)
    if (!bounty || !(await canView(req, bounty))) throw new HttpError(404, 'Bounty not found')

    const rows = await query(
      `SELECT ${SUBMISSION_COLUMNS}
         FROM submissions s
         JOIN bounties b ON b.id = s.bounty_id
         LEFT JOIN users su ON su.id = COALESCE(s.submitter_user_id, (SELECT user_id FROM wallets WHERE address = s.submitter_wallet))
        WHERE s.bounty_id = $1
        ORDER BY s.position NULLS LAST, s.created_at ASC`,
      [bounty.id],
    )
    // Review progress and comment counts are only for the creator, the contributor themself and admins.
    const viewerWallet = req.user ? await getLinkedWallet(req.user.id) : null
    const reviewer = isAdminUser(req.user) || (viewerWallet !== null && viewerWallet === bounty.creatorWallet)
    const submissions = (rows.rows as Array<{ submitterWallet: string; reviewStatus: string | null; commentCount: number | null }>).map((row) => {
      const party = reviewer || (viewerWallet !== null && viewerWallet === row.submitterWallet)
      return party ? row : { ...row, reviewStatus: null, commentCount: null }
    })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ submissions })
  }),
)

const CreateSubmissionSchema = SubmissionMetadataSchema.extend({
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
})

bountiesRouter.post(
  '/:id/submissions',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const id = parseOnchainId(req.params.id)
    const { txHash, ...meta } = parse(CreateSubmissionSchema, req.body)
    const user = req.user!
    const wallet = req.wallet!

    const bounty = await loadBountyRow(id)
    if (!bounty || bounty.moderationStatus !== 'approved') throw new HttpError(404, 'Bounty not found')
    if (bounty.creatorWallet === wallet) throw new HttpError(403, 'Creators cannot submit to their own bounty.')

    const onchainHash = await readSubmissionHash(id, wallet)
    if (!onchainHash) throw new HttpError(409, 'Submit your work on-chain first, then attach the notes.')
    if (onchainHash !== submissionCommitment(id, meta)) {
      throw new HttpError(422, 'Notes do not match the hash recorded on-chain.')
    }

    const saved = await query(
      `INSERT INTO submissions (bounty_id, submitter_wallet, submitter_user_id, submission_hash, description, pull_request_url, attachments, notes_verified, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
       ON CONFLICT (bounty_id, submitter_wallet) DO UPDATE SET
         submitter_user_id = EXCLUDED.submitter_user_id,
         submission_hash = EXCLUDED.submission_hash,
         description = EXCLUDED.description,
         pull_request_url = EXCLUDED.pull_request_url,
         attachments = EXCLUDED.attachments,
         notes_verified = TRUE,
         tx_hash = COALESCE(submissions.tx_hash, EXCLUDED.tx_hash),
         updated_at = NOW()
       WHERE submissions.notes_verified = FALSE
       RETURNING id`,
      [bounty.id, wallet, user.id, onchainHash, meta.description, meta.pullRequestUrl, [...new Set(meta.attachments)], txHash ?? null],
    )
    if (saved.rowCount === 0) throw new HttpError(409, 'Notes were already attached to this submission.')

    nudgeIndexer()
    res.status(201).json({ ok: true })
  }),
)

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

    const statuses = statusParam
      ? statusParam
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 5)
      : DEFAULT_PUBLIC_STATUSES

    const cacheKey = JSON.stringify([limit, offset, sort, search, statuses, openOnly, creator])
    const result = await listCache.get(cacheKey, async () => {
      const params: unknown[] = [statuses.length > 0 ? statuses : DEFAULT_PUBLIC_STATUSES]
      let where = `b.moderation_status = 'approved' AND b.metadata_verified AND b.onchain_status = ANY($1::int[])`

      if (openOnly) where += ` AND b.onchain_status = 1 AND b.deadline > NOW()`
      if (creator && /^0x[0-9a-f]{40}$/.test(creator)) {
        params.push(creator)
        where += ` AND b.creator_wallet = $${params.length}`
      }

      const tsQuery = toTsQuery(search)
      if (tsQuery && search) {
        params.push(tsQuery)
        const tsIdx = params.length
        params.push(search.toLowerCase())
        where += ` AND (b.search_tsv @@ to_tsquery('simple', $${tsIdx}) OR $${params.length} = ANY(b.tags))`
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
})

bountiesRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 12, key: (req) => req.ip ?? 'anon' }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const { onchainId, txHash, ...meta } = parse(CreateBountySchema, req.body)
    const user = req.user!
    const wallet = req.wallet!

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

    nudgeIndexer()
    const bounty = await loadBountyRow(onchainId)
    res.status(201).json({ bounty })
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
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ submissions: rows.rows })
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

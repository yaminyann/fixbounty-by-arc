import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { adminEmail, getLinkedWallet, isAdminUser, requireAdmin, requireAuth, requireLinkedWallet } from '../auth.js'
import { HttpError, clampInt, isUuid, parse, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { httpUrl } from '../lib/ecosystem.js'
import { notify } from '../services/notify.js'

/**
 * Disputes. A contributor can ask for mediation when their work was rejected, when a prize was taken back although
 * they had submitted, or when the creator has not decided well after the deadline. An admin mediates and records an
 * outcome. The contract has no dispute logic and a creator can still reclaim, so an outcome is a public record and
 * a recommendation, never a transfer of money.
 */
export const disputesRouter = Router()
export const adminDisputesRouter = Router()

const NO_DECISION_AFTER_MS = 3 * 24 * 3600 * 1000

interface DisputeContext {
  id: string
  submissionId: string
  bountyId: string
  bountyOnchainId: number
  bountyTitle: string
  creatorUserId: string | null
  creatorWallet: string
  submitterUserId: string | null
  submitterWallet: string
  status: string
  reason: string
}

async function loadDispute(id: string): Promise<DisputeContext> {
  if (!isUuid(id)) throw new HttpError(404, 'Dispute not found')
  const res = await query<DisputeContext>(
    `SELECT d.id, d.submission_id AS "submissionId", d.bounty_id AS "bountyId", b.onchain_id::int AS "bountyOnchainId", b.title AS "bountyTitle",
            b.creator_user_id AS "creatorUserId", b.creator_wallet AS "creatorWallet", s.submitter_user_id AS "submitterUserId",
            s.submitter_wallet AS "submitterWallet", d.status, d.reason
       FROM disputes d JOIN submissions s ON s.id = d.submission_id JOIN bounties b ON b.id = d.bounty_id WHERE d.id = $1`,
    [id],
  )
  if (!res.rows[0]) throw new HttpError(404, 'Dispute not found')
  return res.rows[0]
}

type Role = 'contributor' | 'creator' | 'mediator'

async function roleFor(req: Request, d: DisputeContext): Promise<Role> {
  const user = req.user!
  const wallet = await getLinkedWallet(user.id)
  if (d.creatorUserId === user.id || (wallet !== null && wallet === d.creatorWallet)) return 'creator'
  if (d.submitterUserId === user.id || (wallet !== null && wallet === d.submitterWallet)) return 'contributor'
  if (isAdminUser(user)) return 'mediator'
  throw new HttpError(404, 'Dispute not found')
}

const DISPUTE_SELECT = `
  d.id, d.reason, d.summary, d.status, d.resolution_note AS "resolutionNote", d.created_at AS "createdAt", d.resolved_at AS "resolvedAt",
  b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", s.submitter_wallet AS "submitterWallet", b.creator_wallet AS "creatorWallet",
  (SELECT COUNT(*)::int FROM dispute_comments c WHERE c.dispute_id = d.id) AS "commentCount"`

disputesRouter.use(requireAuth)

disputesRouter.get(
  '/mine',
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const rows = await query(
      `SELECT ${DISPUTE_SELECT}, CASE WHEN s.submitter_wallet = $1 THEN 'contributor' ELSE 'creator' END AS role
         FROM disputes d JOIN submissions s ON s.id = d.submission_id JOIN bounties b ON b.id = d.bounty_id
        WHERE s.submitter_wallet = $1 OR b.creator_wallet = $1 ORDER BY d.created_at DESC LIMIT 100`,
      [req.wallet],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

const OpenSchema = z.object({ submissionId: z.string().uuid(), summary: z.string().trim().min(20).max(3_000) })

disputesRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 10 }),
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const { submissionId, summary } = parse(OpenSchema, req.body)
    const found = await query<{
      submitter_wallet: string
      notes_verified: boolean
      review_status: string
      bounty_id: string
      onchain_id: number
      title: string
      status: number
      deadline: string
      creator_user_id: string | null
      moderation_status: string
    }>(
      `SELECT s.submitter_wallet, s.notes_verified, s.review_status, b.id AS bounty_id, b.onchain_id::int AS onchain_id, b.title, b.onchain_status AS status,
              b.deadline, b.creator_user_id, b.moderation_status
         FROM submissions s JOIN bounties b ON b.id = s.bounty_id WHERE s.id = $1`,
      [submissionId],
    )
    const s = found.rows[0]
    if (!s || s.submitter_wallet !== req.wallet || s.moderation_status !== 'approved') throw new HttpError(404, 'Submission not found')
    if (!s.notes_verified) throw new HttpError(409, 'Attach your notes to the submission first.')

    let reason: 'rejected' | 'reclaimed' | 'no_decision' | null = null
    if (s.review_status === 'rejected') reason = 'rejected'
    else if (s.status === 4) reason = 'reclaimed'
    else if (s.status === 1 && new Date(s.deadline).getTime() + NO_DECISION_AFTER_MS < Date.now()) reason = 'no_decision'
    if (!reason) throw new HttpError(409, 'A dispute can be opened when your work was rejected, the prize was reclaimed after you submitted, or the creator has not decided three days after the deadline.')

    let id: string
    try {
      const created = await query<{ id: string }>('INSERT INTO disputes (submission_id, bounty_id, opened_by, reason, summary) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
        submissionId,
        s.bounty_id,
        req.user!.id,
        reason,
        summary,
      ])
      id = created.rows[0].id
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This submission already has a dispute.')
      throw err
    }
    await notify({ userId: s.creator_user_id, kind: 'dispute_opened', title: 'A contributor opened a dispute', body: s.title, link: `/disputes/${id}` })
    res.status(201).json({ id })
  }),
)

disputesRouter.get(
  '/:id',
  route(async (req: Request, res: Response) => {
    const d = await loadDispute(String(req.params.id))
    const role = await roleFor(req, d)
    const dispute = await query(
      `SELECT ${DISPUTE_SELECT} FROM disputes d JOIN submissions s ON s.id = d.submission_id JOIN bounties b ON b.id = d.bounty_id WHERE d.id = $1`,
      [d.id],
    )
    const comments = await query(
      `SELECT c.id, c.body, c.links, c.author_role AS "authorRole", c.created_at AS "createdAt", c.author_wallet AS "authorWallet",
              COALESCE(cp.display_name, u.display_name) AS "authorName"
         FROM dispute_comments c LEFT JOIN users u ON u.id = c.author_user_id LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE c.dispute_id = $1 ORDER BY c.created_at`,
      [d.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ dispute: dispute.rows[0], role, comments: comments.rows })
  }),
)

const CommentSchema = z.object({ body: z.string().trim().min(1).max(2_000), links: z.array(httpUrl).max(5).default([]) })

async function addComment(req: Request, d: DisputeContext, role: Role, wallet: string | null) {
  const input = parse(CommentSchema, req.body)
  if (d.status !== 'open') throw new HttpError(409, 'This dispute is closed.')
  await query('INSERT INTO dispute_comments (dispute_id, author_user_id, author_wallet, author_role, body, links) VALUES ($1, $2, $3, $4, $5, $6)', [
    d.id,
    req.user!.id,
    wallet,
    role,
    input.body,
    [...new Set(input.links)],
  ])
  const others: Array<string | null> = []
  if (role !== 'creator') others.push(d.creatorUserId)
  if (role !== 'contributor') {
    others.push(d.submitterUserId ?? (await query<{ user_id: string }>('SELECT user_id FROM wallets WHERE address = $1', [d.submitterWallet])).rows[0]?.user_id ?? null)
  }
  for (const userId of others) {
    await notify({ userId, kind: 'dispute_comment', title: 'New message in a dispute', body: d.bountyTitle, link: `/disputes/${d.id}` })
  }
}

disputesRouter.post(
  '/:id/comments',
  rateLimit({ windowMs: 60_000, max: 40 }),
  route(async (req: Request, res: Response) => {
    const d = await loadDispute(String(req.params.id))
    const role = await roleFor(req, d)
    await addComment(req, d, role, await getLinkedWallet(req.user!.id))
    res.status(201).json({ ok: true })
  }),
)

// ---- admin mediation ---------------------------------------------------------------------------------------

adminDisputesRouter.use(requireAuth, requireAdmin)

adminDisputesRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 50, 1, 100)
    const status = typeof req.query.status === 'string' && ['open', 'upheld', 'dismissed', 'settled'].includes(req.query.status) ? req.query.status : null
    const rows = await query(
      `SELECT ${DISPUTE_SELECT} FROM disputes d JOIN submissions s ON s.id = d.submission_id JOIN bounties b ON b.id = d.bounty_id
        WHERE ($1::text IS NULL OR d.status = $1) ORDER BY (d.status = 'open') DESC, d.created_at DESC LIMIT $2`,
      [status, limit],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

adminDisputesRouter.post(
  '/:id/comments',
  rateLimit({ windowMs: 60_000, max: 40 }),
  route(async (req: Request, res: Response) => {
    const d = await loadDispute(String(req.params.id))
    await addComment(req, d, 'mediator', null)
    res.status(201).json({ ok: true })
  }),
)

const ResolveSchema = z.object({ outcome: z.enum(['upheld', 'dismissed', 'settled']), note: z.string().trim().min(10).max(2_000) })

adminDisputesRouter.post(
  '/:id/resolve',
  route(async (req: Request, res: Response) => {
    const d = await loadDispute(String(req.params.id))
    const { outcome, note } = parse(ResolveSchema, req.body)
    if (d.status !== 'open') throw new HttpError(409, 'This dispute is already closed.')
    await withTransaction(async (db) => {
      await db.query(`UPDATE disputes SET status = $2, resolution_note = $3, resolved_by = $4, resolved_at = NOW() WHERE id = $1`, [d.id, outcome, note, adminEmail(req)])
      await db.query(`INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, detail) VALUES ($1, $2, 'dispute', $3, $4)`, [
        adminEmail(req),
        `dispute.${outcome}`,
        d.id,
        JSON.stringify({ bounty: d.bountyOnchainId }),
      ])
    })
    const wallet = await query<{ user_id: string }>('SELECT user_id FROM wallets WHERE address = $1', [d.submitterWallet])
    for (const userId of [d.creatorUserId, d.submitterUserId ?? wallet.rows[0]?.user_id ?? null]) {
      await notify({ userId, kind: 'dispute_resolved', title: `Dispute closed: ${outcome}`, body: d.bountyTitle, link: `/disputes/${d.id}` })
    }
    res.json({ status: outcome })
  }),
)

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { getLinkedWallet, isAdminUser, optionalAuth, requireAuth, requireLinkedWallet } from '../auth.js'
import { HttpError, isUuid, parse, parseOnchainId, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { canSeeBounty, httpUrl, isBountyCreator, loadBountyAccess } from '../lib/ecosystem.js'
import { notify } from '../services/notify.js'

/**
 * Milestones split one escrowed prize into reviewable pieces.
 *
 * The BountyBoard contract escrows a single prize per bounty and pays by prize place, so milestones are
 * a coordination layer: the planned amounts and approvals are recorded here and are not on-chain payments.
 */
export const milestonesRouter = Router()

const MAX_MILESTONES = 12

const MilestoneSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2_000).default(''),
  rewardAmount: z.string().regex(/^[1-9]\d{0,14}$/, 'Reward must be a positive amount in USDC base units'),
})

const MILESTONE_COLUMNS = `
  m.id, m.position, m.title, m.description, m.reward_amount::text AS "rewardAmount", m.approved_at AS "approvedAt",
  CASE
    WHEN m.approved_submission_id IS NOT NULL THEN 'approved'
    WHEN EXISTS (SELECT 1 FROM milestone_submissions s WHERE s.milestone_id = m.id AND s.review_status = 'submitted') THEN 'in_review'
    WHEN EXISTS (SELECT 1 FROM milestone_submissions s WHERE s.milestone_id = m.id AND s.review_status = 'changes_requested') THEN 'changes_requested'
    ELSE 'open'
  END AS status,
  (SELECT COUNT(*)::int FROM milestone_submissions s WHERE s.milestone_id = m.id) AS "submissionCount"`

interface MilestoneRow {
  id: string
  rewardAmount: string
}

interface SubRow {
  id: string
  milestoneId: string
  submitterWallet: string
  submitterName: string | null
  submitterPhoto: string | null
  description: string
  links: string[]
  reviewStatus: string
  createdAt: string
  commentCount: number
  approved: boolean
}

milestonesRouter.get(
  '/:id/milestones',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (!(await canSeeBounty(req, bounty))) throw new HttpError(404, 'Bounty not found')

    const viewerWallet = req.user ? await getLinkedWallet(req.user.id) : null
    const reviewer = isAdminUser(req.user) || (req.user !== undefined && bounty.creator_user_id === req.user.id) || (viewerWallet !== null && viewerWallet === bounty.creator_wallet)

    const milestones = await query<MilestoneRow>(
      `SELECT ${MILESTONE_COLUMNS} FROM bounty_milestones m WHERE m.bounty_id = $1 ORDER BY m.position`,
      [bounty.id],
    )
    const subs = await query<SubRow>(
      `SELECT s.id, s.milestone_id AS "milestoneId", s.submitter_wallet AS "submitterWallet", s.description, s.links,
              s.review_status AS "reviewStatus", s.created_at AS "createdAt",
              COALESCE(cp.display_name, u.display_name) AS "submitterName", COALESCE(cp.avatar_url, u.photo_url) AS "submitterPhoto",
              (SELECT COUNT(*)::int FROM review_comments c WHERE c.target_type = 'milestone_submission' AND c.target_id = s.id) AS "commentCount",
              (m.approved_submission_id = s.id) AS approved
         FROM milestone_submissions s
         JOIN bounty_milestones m ON m.id = s.milestone_id
         LEFT JOIN users u ON u.id = COALESCE(s.submitter_user_id, (SELECT user_id FROM wallets WHERE address = s.submitter_wallet))
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE m.bounty_id = $1
        ORDER BY s.created_at ASC`,
      [bounty.id],
    )

    const items = milestones.rows.map((m) => ({
      ...m,
      // Creators see every submission, contributors see their own, and the public sees only who got a milestone approved.
      submissions: subs.rows
        .filter((s) => s.milestoneId === m.id)
        .filter((s) => reviewer || (viewerWallet !== null && s.submitterWallet === viewerWallet) || s.approved)
        .map((s) => {
          const full = reviewer || (viewerWallet !== null && s.submitterWallet === viewerWallet)
          return full ? s : { id: s.id, submitterWallet: s.submitterWallet, submitterName: s.submitterName, approved: true, reviewStatus: 'approved' }
        }),
    }))
    const planned = milestones.rows.reduce((sum, m) => sum + BigInt(m.rewardAmount), 0n)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items, plannedTotal: planned.toString(), rewardAmount: bounty.reward_amount, editable: isBountyCreator(req, bounty) && [0, 1].includes(bounty.onchain_status) })
  }),
)

// --- creator: manage milestones -----------------------------------------------------------------

async function assertEditable(req: Request, onchainId: number) {
  const bounty = await loadBountyAccess(onchainId)
  if (!isBountyCreator(req, bounty)) throw new HttpError(403, 'Only the creator can manage milestones.')
  if (![0, 1].includes(bounty.onchain_status)) throw new HttpError(409, 'Milestones can only change before winners are picked.')
  return bounty
}

async function plannedTotal(bountyId: string, excludeId?: string): Promise<bigint> {
  const res = await query<{ total: string }>(
    `SELECT COALESCE(SUM(reward_amount), 0)::text AS total FROM bounty_milestones WHERE bounty_id = $1 AND ($2::uuid IS NULL OR id <> $2)`,
    [bountyId, excludeId ?? null],
  )
  return BigInt(res.rows[0].total)
}

milestonesRouter.post(
  '/:id/milestones',
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await assertEditable(req, parseOnchainId(req.params.id))
    const input = parse(MilestoneSchema, req.body)

    const count = await query<{ n: number; max: number | null }>('SELECT COUNT(*)::int AS n, MAX(position)::int AS max FROM bounty_milestones WHERE bounty_id = $1', [bounty.id])
    if (count.rows[0].n >= MAX_MILESTONES) throw new HttpError(409, `A bounty can have up to ${MAX_MILESTONES} milestones.`)
    if ((await plannedTotal(bounty.id)) + BigInt(input.rewardAmount) > BigInt(bounty.reward_amount)) {
      throw new HttpError(409, 'Milestone rewards cannot add up to more than the prize pool.')
    }
    const created = await query<{ id: string }>(
      `INSERT INTO bounty_milestones (bounty_id, position, title, description, reward_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [bounty.id, (count.rows[0].max ?? 0) + 1, input.title, input.description, input.rewardAmount],
    )
    res.status(201).json({ id: created.rows[0].id })
  }),
)

milestonesRouter.post(
  '/:id/milestones/:mid',
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await assertEditable(req, parseOnchainId(req.params.id))
    const mid = String(req.params.mid)
    if (!isUuid(mid)) throw new HttpError(404, 'Milestone not found')
    const input = parse(MilestoneSchema, req.body)
    const current = await query<{ approved_submission_id: string | null }>('SELECT approved_submission_id FROM bounty_milestones WHERE id = $1 AND bounty_id = $2', [mid, bounty.id])
    if (!current.rows[0]) throw new HttpError(404, 'Milestone not found')
    if (current.rows[0].approved_submission_id) throw new HttpError(409, 'An approved milestone cannot be edited.')
    if ((await plannedTotal(bounty.id, mid)) + BigInt(input.rewardAmount) > BigInt(bounty.reward_amount)) {
      throw new HttpError(409, 'Milestone rewards cannot add up to more than the prize pool.')
    }
    await query('UPDATE bounty_milestones SET title = $2, description = $3, reward_amount = $4, updated_at = NOW() WHERE id = $1', [mid, input.title, input.description, input.rewardAmount])
    res.json({ ok: true })
  }),
)

milestonesRouter.delete(
  '/:id/milestones/:mid',
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await assertEditable(req, parseOnchainId(req.params.id))
    const mid = String(req.params.mid)
    if (!isUuid(mid)) throw new HttpError(404, 'Milestone not found')
    await withTransaction(async (db) => {
      const subs = await db.query('SELECT 1 FROM milestone_submissions WHERE milestone_id = $1 LIMIT 1', [mid])
      if ((subs.rowCount ?? 0) > 0) throw new HttpError(409, 'This milestone already has submissions, so it cannot be removed.')
      const removed = await db.query('DELETE FROM bounty_milestones WHERE id = $1 AND bounty_id = $2', [mid, bounty.id])
      if (removed.rowCount === 0) throw new HttpError(404, 'Milestone not found')
      await db.query(
        `UPDATE bounty_milestones m SET position = r.rn FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position)::int AS rn FROM bounty_milestones WHERE bounty_id = $1) r
          WHERE m.id = r.id AND m.position <> r.rn`,
        [bounty.id],
      )
    })
    res.json({ ok: true })
  }),
)

// --- contributor: submit work against a milestone -----------------------------------------------

const MilestoneWorkSchema = z.object({
  description: z.string().trim().min(10).max(5_000),
  links: z.array(httpUrl).max(5).default([]),
})

milestonesRouter.post(
  '/:id/milestones/:mid/submissions',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (bounty.moderation_status !== 'approved') throw new HttpError(404, 'Bounty not found')
    if (isBountyCreator(req, bounty)) throw new HttpError(403, 'Creators cannot submit to their own bounty.')
    if (bounty.onchain_status !== 1 || new Date(bounty.deadline).getTime() <= Date.now()) throw new HttpError(409, 'This bounty is not accepting work right now.')
    const mid = String(req.params.mid)
    if (!isUuid(mid)) throw new HttpError(404, 'Milestone not found')
    const input = parse(MilestoneWorkSchema, req.body)

    const milestone = await query<{ id: string; title: string; approved_submission_id: string | null }>(
      'SELECT id, title, approved_submission_id FROM bounty_milestones WHERE id = $1 AND bounty_id = $2',
      [mid, bounty.id],
    )
    if (!milestone.rows[0]) throw new HttpError(404, 'Milestone not found')
    if (milestone.rows[0].approved_submission_id) throw new HttpError(409, 'This milestone is already approved.')

    try {
      await query(
        `INSERT INTO milestone_submissions (milestone_id, submitter_user_id, submitter_wallet, description, links)
         VALUES ($1, $2, $3, $4, $5)`,
        [mid, req.user!.id, req.wallet, input.description, [...new Set(input.links)]],
      )
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'You already submitted work for this milestone. Add an update in its review thread instead.')
      throw err
    }
    await notify({
      userId: bounty.creator_user_id,
      kind: 'milestone_submission',
      title: 'New milestone submission',
      body: `${bounty.title}: ${milestone.rows[0].title}`,
      link: `/bounty/${bounty.onchain_id}?tab=milestones`,
    })
    res.status(201).json({ ok: true })
  }),
)

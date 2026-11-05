import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { getLinkedWallet, isAdminUser, optionalAuth, requireAuth, requireLinkedWallet } from '../auth.js'
import { HttpError, isUuid, parse, parseOnchainId, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { canSeeBounty, isBountyCreator, loadBountyAccess } from '../lib/ecosystem.js'
import { notify } from '../services/notify.js'

/**
 * Team bounties are coordination only. The contract pays one wallet per prize place, so the roles and the
 * split recorded here describe what the team agreed between themselves; they never move USDC.
 */
export const teamsRouter = Router()

const MEMBER_COLUMNS = `
  t.id, t.wallet, t.role, t.responsibility, t.share_bps AS "shareBps", t.status, t.message, t.created_at AS "joinedAt",
  COALESCE(cp.display_name, u.display_name) AS name, COALESCE(cp.avatar_url, u.photo_url) AS photo`

teamsRouter.get(
  '/:id/team',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (!(await canSeeBounty(req, bounty))) throw new HttpError(404, 'Bounty not found')

    const viewerWallet = req.user ? await getLinkedWallet(req.user.id) : null
    const reviewer = isAdminUser(req.user) || (viewerWallet !== null && viewerWallet === bounty.creator_wallet)

    const rows = await query<{ wallet: string; status: string; shareBps: number | null }>(
      `SELECT ${MEMBER_COLUMNS}
         FROM bounty_team_members t
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE t.bounty_id = $1 AND t.status IN ('active', 'requested')
        ORDER BY t.created_at ASC`,
      [bounty.id],
    )
    const members = rows.rows.filter((m) => m.status === 'active')
    const requests = rows.rows.filter((m) => m.status === 'requested' && (reviewer || m.wallet === viewerWallet))
    const mine = viewerWallet ? ((await query('SELECT status FROM bounty_team_members WHERE bounty_id = $1 AND wallet = $2', [bounty.id, viewerWallet])).rows[0] ?? null) : null

    const progress = await query<{ total: number; approved: number; submissions: number }>(
      `SELECT (SELECT COUNT(*)::int FROM bounty_milestones WHERE bounty_id = $1) AS total,
              (SELECT COUNT(*)::int FROM bounty_milestones WHERE bounty_id = $1 AND approved_submission_id IS NOT NULL) AS approved,
              (SELECT submission_count FROM bounties WHERE id = $1)::int AS submissions`,
      [bounty.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      workMode: bounty.work_mode,
      members,
      requests,
      mine,
      assignedBps: members.reduce((sum, m) => sum + (m.shareBps ?? 0), 0),
      progress: { milestonesTotal: progress.rows[0].total, milestonesApproved: progress.rows[0].approved, submissions: progress.rows[0].submissions },
    })
  }),
)

const JoinSchema = z.object({ message: z.string().trim().max(500).default('') })

teamsRouter.post(
  '/:id/team/join',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (bounty.moderation_status !== 'approved') throw new HttpError(404, 'Bounty not found')
    if (bounty.work_mode !== 'team') throw new HttpError(409, 'This is not a team bounty.')
    if (isBountyCreator(req, bounty)) throw new HttpError(403, 'Creators cannot join their own team.')
    if (bounty.onchain_status !== 1 || new Date(bounty.deadline).getTime() <= Date.now()) throw new HttpError(409, 'This bounty is not accepting work right now.')
    const { message } = parse(JoinSchema, req.body)

    const existing = await query<{ status: string }>('SELECT status FROM bounty_team_members WHERE bounty_id = $1 AND wallet = $2', [bounty.id, req.wallet])
    if (existing.rows[0]?.status === 'active') throw new HttpError(409, 'You are already on this team.')
    if (existing.rows[0]?.status === 'requested') throw new HttpError(409, 'Your request is waiting for the creator.')

    await query(
      `INSERT INTO bounty_team_members (bounty_id, user_id, wallet, message, status)
       VALUES ($1, $2, $3, $4, 'requested')
       ON CONFLICT (bounty_id, wallet) DO UPDATE SET status = 'requested', message = EXCLUDED.message, user_id = EXCLUDED.user_id, share_bps = NULL, updated_at = NOW()`,
      [bounty.id, req.user!.id, req.wallet, message],
    )
    await notify({
      userId: bounty.creator_user_id,
      kind: 'team_request',
      title: 'Someone asked to join your team',
      body: bounty.title,
      link: `/bounty/${bounty.onchain_id}?tab=team`,
    })
    res.status(201).json({ ok: true })
  }),
)

teamsRouter.post(
  '/:id/team/leave',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    const left = await query(
      `UPDATE bounty_team_members SET status = 'left', share_bps = NULL, updated_at = NOW()
        WHERE bounty_id = $1 AND wallet = $2 AND status IN ('active', 'requested') RETURNING id`,
      [bounty.id, req.wallet],
    )
    if (left.rowCount === 0) throw new HttpError(404, 'You are not on this team.')
    await notify({ userId: bounty.creator_user_id, kind: 'team_left', title: 'A team member left', body: bounty.title, link: `/bounty/${bounty.onchain_id}?tab=team` })
    res.json({ ok: true })
  }),
)

const DecisionSchema = z.object({
  decision: z.enum(['accept', 'decline', 'remove']),
  role: z.string().trim().max(80).default(''),
  responsibility: z.string().trim().max(1_000).default(''),
  shareBps: z.number().int().min(0).max(10_000).nullish(),
})

teamsRouter.post(
  '/:id/team/:memberId',
  rateLimit({ windowMs: 60_000, max: 40 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (!isBountyCreator(req, bounty)) throw new HttpError(403, 'Only the creator manages the team.')
    const memberId = String(req.params.memberId)
    if (!isUuid(memberId)) throw new HttpError(404, 'Team member not found')
    const input = parse(DecisionSchema, req.body)
    if ([2, 3, 4, 5].includes(bounty.onchain_status)) throw new HttpError(409, 'The team can no longer change.')

    const member = await withTransaction(async (db) => {
      const found = await db.query<{ id: string; user_id: string | null; wallet: string; status: string }>(
        'SELECT id, user_id, wallet, status FROM bounty_team_members WHERE id = $1 AND bounty_id = $2 FOR UPDATE',
        [memberId, bounty.id],
      )
      const row = found.rows[0]
      if (!row) throw new HttpError(404, 'Team member not found')

      if (input.decision === 'accept') {
        const others = await db.query<{ total: string }>(
          `SELECT COALESCE(SUM(share_bps), 0)::text AS total FROM bounty_team_members WHERE bounty_id = $1 AND status = 'active' AND id <> $2`,
          [bounty.id, row.id],
        )
        if (Number(others.rows[0].total) + (input.shareBps ?? 0) > 10_000) throw new HttpError(409, 'Shares cannot add up to more than 100%.')
        await db.query(
          `UPDATE bounty_team_members SET status = 'active', role = $2, responsibility = $3, share_bps = $4, updated_at = NOW() WHERE id = $1`,
          [row.id, input.role, input.responsibility, input.shareBps ?? null],
        )
      } else {
        await db.query(`UPDATE bounty_team_members SET status = $2, share_bps = NULL, updated_at = NOW() WHERE id = $1`, [row.id, input.decision === 'decline' ? 'declined' : 'left'])
      }
      return row
    })

    if (member.status !== 'active' || input.decision !== 'accept') {
      await notify({
        userId: member.user_id,
        kind: input.decision === 'accept' ? 'team_accepted' : 'team_declined',
        title: input.decision === 'accept' ? 'You joined a team' : 'Your team request was closed',
        body: bounty.title,
        link: `/bounty/${bounty.onchain_id}?tab=team`,
      })
    }
    res.json({ ok: true })
  }),
)

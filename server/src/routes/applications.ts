import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { getLinkedWallet, isAdminUser, optionalAuth, requireAuth, requireLinkedWallet } from '../auth.js'
import { HttpError, isUuid, parse, parseOnchainId, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { canSeeBounty, isBountyCreator, loadBountyAccess } from '../lib/ecosystem.js'
import { notify } from '../services/notify.js'

/**
 * Apply before you start. A creator can ask contributors to apply and approve the people who should take the work.
 * This is coordination only: the contract accepts a submission from any wallet, so approval records who the creator
 * expects to hear from, and does not block anyone.
 */
export const applicationsRouter = Router()

const COLUMNS = `
  a.id, a.wallet, a.message, a.status, a.decision_note AS "decisionNote", a.created_at AS "appliedAt",
  COALESCE(cp.display_name, u.display_name) AS name, COALESCE(cp.avatar_url, u.photo_url) AS photo`

applicationsRouter.get(
  '/:id/applications',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (!(await canSeeBounty(req, bounty))) throw new HttpError(404, 'Bounty not found')
    const accepting = await query<{ accepts_applications: boolean }>('SELECT accepts_applications FROM bounties WHERE id = $1', [bounty.id])
    const viewerWallet = req.user ? await getLinkedWallet(req.user.id) : null
    const reviewer = isAdminUser(req.user) || (viewerWallet !== null && viewerWallet === bounty.creator_wallet)

    const rows = await query<{ wallet: string; status: string }>(
      `SELECT ${COLUMNS} FROM bounty_applications a
         LEFT JOIN users u ON u.id = a.user_id LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE a.bounty_id = $1 AND a.status IN ('requested', 'approved', 'declined') ORDER BY a.created_at`,
      [bounty.id],
    )
    const items = rows.rows
      .filter((a) => reviewer || a.status === 'approved' || a.wallet === viewerWallet)
      // Other people's messages stay private to the creator.
      .map((a) => (reviewer || a.wallet === viewerWallet ? a : { ...a, message: '', decisionNote: '' }))
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ accepting: accepting.rows[0]?.accepts_applications ?? false, items, total: rows.rows.length })
  }),
)

const ApplySchema = z.object({ message: z.string().trim().max(500).default('') })

applicationsRouter.post(
  '/:id/applications',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (bounty.moderation_status !== 'approved') throw new HttpError(404, 'Bounty not found')
    const open = await query<{ accepts_applications: boolean }>('SELECT accepts_applications FROM bounties WHERE id = $1', [bounty.id])
    if (!open.rows[0]?.accepts_applications) throw new HttpError(409, 'This bounty does not ask for applications.')
    if (isBountyCreator(req, bounty)) throw new HttpError(403, 'Creators cannot apply to their own bounty.')
    if (bounty.onchain_status !== 1 || new Date(bounty.deadline).getTime() <= Date.now()) throw new HttpError(409, 'This bounty is not accepting work right now.')
    const { message } = parse(ApplySchema, req.body)

    const existing = await query<{ status: string }>('SELECT status FROM bounty_applications WHERE bounty_id = $1 AND wallet = $2', [bounty.id, req.wallet])
    if (existing.rows[0] && ['requested', 'approved'].includes(existing.rows[0].status)) throw new HttpError(409, 'You already applied.')
    if (existing.rows[0]?.status === 'declined') throw new HttpError(409, 'The creator declined your application.')

    await query(
      `INSERT INTO bounty_applications (bounty_id, user_id, wallet, message, status) VALUES ($1, $2, $3, $4, 'requested')
       ON CONFLICT (bounty_id, wallet) DO UPDATE SET status = 'requested', message = EXCLUDED.message, user_id = EXCLUDED.user_id, decision_note = '', updated_at = NOW()`,
      [bounty.id, req.user!.id, req.wallet, message],
    )
    await notify({ userId: bounty.creator_user_id, kind: 'application', title: 'A contributor applied to your bounty', body: bounty.title, link: `/bounty/${bounty.onchain_id}?tab=applicants` })
    res.status(201).json({ ok: true })
  }),
)

applicationsRouter.post(
  '/:id/applications/withdraw',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    const done = await query(
      `UPDATE bounty_applications SET status = 'withdrawn', updated_at = NOW() WHERE bounty_id = $1 AND wallet = $2 AND status IN ('requested', 'approved') RETURNING id`,
      [bounty.id, req.wallet],
    )
    if (done.rowCount === 0) throw new HttpError(404, 'You have no active application.')
    res.json({ ok: true })
  }),
)

const DecisionSchema = z.object({ decision: z.enum(['approve', 'decline']), note: z.string().trim().max(300).default('') })

applicationsRouter.post(
  '/:id/applications/:appId',
  rateLimit({ windowMs: 60_000, max: 60 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const bounty = await loadBountyAccess(parseOnchainId(req.params.id))
    if (!isBountyCreator(req, bounty)) throw new HttpError(403, 'Only the creator decides on applications.')
    const appId = String(req.params.appId)
    if (!isUuid(appId)) throw new HttpError(404, 'Application not found')
    const { decision, note } = parse(DecisionSchema, req.body)
    if (decision === 'decline' && note.length < 3) throw new HttpError(400, 'Add a short reason so the contributor knows why.')
    const found = await query<{ user_id: string | null; status: string }>('SELECT user_id, status FROM bounty_applications WHERE id = $1 AND bounty_id = $2', [appId, bounty.id])
    const app = found.rows[0]
    if (!app || app.status === 'withdrawn') throw new HttpError(404, 'Application not found')
    if ([2, 3, 4, 5].includes(bounty.onchain_status)) throw new HttpError(409, 'This bounty is closed.')

    await query('UPDATE bounty_applications SET status = $2, decision_note = $3, updated_at = NOW() WHERE id = $1', [appId, decision === 'approve' ? 'approved' : 'declined', note])
    await notify({
      userId: app.user_id,
      kind: decision === 'approve' ? 'application_approved' : 'application_declined',
      title: decision === 'approve' ? 'You were approved to work on a bounty' : 'Your application was declined',
      body: bounty.title,
      link: `/bounty/${bounty.onchain_id}`,
    })
    res.json({ ok: true })
  }),
)

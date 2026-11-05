import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { getLinkedWallet, isAdminUser, requireAuth } from '../auth.js'
import { HttpError, isUuid, parse, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { SLUG_RE, WALLET_RE, projectRole } from '../lib/ecosystem.js'
import { isAllowedWebhook } from '../services/alerts.js'
import { GithubUnavailable, checkSubmissionPr, parsePullRequestUrl } from '../services/github.js'

const PUBLIC_BOUNTY = `b.moderation_status = 'approved' AND b.metadata_verified`

// ---------------------------------------------------------------------------------------------
// Creator record: what a creator did with the bounties they funded, from the contract's own records
// ---------------------------------------------------------------------------------------------

export const creatorsRouter = Router()

creatorsRouter.get(
  '/:wallet',
  route(async (req: Request, res: Response) => {
    const wallet = String(req.params.wallet).toLowerCase()
    if (!WALLET_RE.test(wallet)) throw new HttpError(400, 'Invalid wallet address')

    const [counts, paid, decide] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE b.onchain_status IN (1, 2, 3, 4))::int AS funded,
           COALESCE(SUM(b.reward_amount) FILTER (WHERE b.onchain_status IN (1, 2, 3, 4)), 0)::text AS "fundedAmount",
           COUNT(*) FILTER (WHERE b.onchain_status IN (1, 2, 3, 4) AND b.submission_count > 0)::int AS "receivedSubmissions",
           COUNT(*) FILTER (WHERE b.winner_count > 0)::int AS "pickedWinners",
           COUNT(*) FILTER (WHERE b.onchain_status = 4 AND b.submission_count > 0)::int AS "reclaimedAfterSubmissions",
           COUNT(*) FILTER (WHERE b.onchain_status = 4 AND b.submission_count = 0)::int AS "reclaimedWithoutSubmissions",
           COUNT(*) FILTER (WHERE b.onchain_status = 1 AND b.deadline <= NOW() AND b.submission_count > 0)::int AS "awaitingDecision",
           COUNT(*) FILTER (WHERE b.onchain_status = 1 AND b.deadline > NOW())::int AS open
         FROM bounties b WHERE b.creator_wallet = $1 AND ${PUBLIC_BOUNTY}`,
        [wallet],
      ),
      query<{ paid: string }>(
        `SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text AS paid
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE a.kind = 'claimed' AND b.creator_wallet = $1 AND ${PUBLIC_BOUNTY}`,
        [wallet],
      ),
      query<{ days: number | null }>(
        `SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (b.approved_at - fs.first)) / 86400))::numeric, 1)::float AS days
           FROM bounties b
           JOIN LATERAL (SELECT MIN(a.block_time) AS first FROM bounty_activity a WHERE a.bounty_id = b.id AND a.kind = 'submitted') fs ON fs.first IS NOT NULL
          WHERE b.creator_wallet = $1 AND ${PUBLIC_BOUNTY} AND b.approved_at IS NOT NULL`,
        [wallet],
      ),
    ])
    res.setHeader('Cache-Control', 'public, max-age=10')
    res.json({ wallet, ...counts.rows[0], paidToWinners: paid.rows[0].paid, medianDaysToPickWinners: decide.rows[0]?.days ?? null })
  }),
)

// ---------------------------------------------------------------------------------------------
// GitHub pull request check for a submission
// ---------------------------------------------------------------------------------------------

export const submissionsRouter = Router()

submissionsRouter.post(
  '/:id/check-pr',
  rateLimit({ windowMs: 60_000, max: 12 }),
  requireAuth,
  route(async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!isUuid(id)) throw new HttpError(404, 'Submission not found')
    const found = await query<{ pull_request_url: string | null; submitter_user_id: string | null; submitter_wallet: string; creator_user_id: string | null; creator_wallet: string; project_id: string | null }>(
      `SELECT s.pull_request_url, s.submitter_user_id, s.submitter_wallet, b.creator_user_id, b.creator_wallet, b.project_id
         FROM submissions s JOIN bounties b ON b.id = s.bounty_id WHERE s.id = $1`,
      [id],
    )
    const s = found.rows[0]
    if (!s) throw new HttpError(404, 'Submission not found')

    const user = req.user!
    const wallet = await getLinkedWallet(user.id)
    const party =
      isAdminUser(user) ||
      s.submitter_user_id === user.id ||
      s.creator_user_id === user.id ||
      (wallet !== null && (wallet === s.submitter_wallet || wallet === s.creator_wallet)) ||
      (s.project_id !== null && (await projectRole(user.id, s.project_id)) !== null)
    if (!party) throw new HttpError(404, 'Submission not found')
    if (!s.pull_request_url || !parsePullRequestUrl(s.pull_request_url)) throw new HttpError(400, 'Only GitHub pull request links can be checked.')

    try {
      const result = await checkSubmissionPr(id, s.pull_request_url)
      res.json({ ...result, checkedAt: new Date().toISOString() })
    } catch (err) {
      if (err instanceof GithubUnavailable) throw new HttpError(503, err.message)
      throw err
    }
  }),
)

// ---------------------------------------------------------------------------------------------
// README badge: bountyfi.xyz/api/badge/<project>.svg
// ---------------------------------------------------------------------------------------------

export const badgeRouter = Router()

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
const textWidth = (s: string) => Math.round(s.length * 6.4 + 14)

function svgBadge(label: string, value: string, color: string): string {
  const lw = textWidth(label)
  const vw = textWidth(value)
  const w = lw + vw
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${w}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#0a0a0a"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text>
<text x="${lw + vw / 2}" y="14" fill="${color === '#fde047' ? '#0a0a0a' : '#fff'}">${esc(value)}</text></g></svg>`
}

badgeRouter.get(
  '/:file',
  rateLimit({ windowMs: 60_000, max: 120 }),
  route(async (req: Request, res: Response) => {
    const slug = String(req.params.file).replace(/\.svg$/i, '').toLowerCase()
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    if (!SLUG_RE.test(slug)) {
      res.status(404).send(svgBadge('BountyFi', 'not found', '#6b7280'))
      return
    }
    const row = await query<{ open: number; paid: string }>(
      `SELECT (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND b.onchain_status = 1 AND b.deadline > NOW()) AS open,
              (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
                WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND a.kind = 'claimed') AS paid
         FROM projects p WHERE p.slug = $1 AND p.status = 'active'`,
      [slug],
    )
    const r = row.rows[0]
    if (!r) {
      res.status(404).send(svgBadge('BountyFi', 'not found', '#6b7280'))
      return
    }
    const paid = Number(BigInt(r.paid) / 1_000_000n)
    const value = `${r.open} open${paid > 0 ? ` · ${paid.toLocaleString('en-US')} USDC paid` : ''}`
    res.send(svgBadge('BountyFi', value, r.open > 0 ? '#fde047' : '#374151'))
  }),
)

// ---------------------------------------------------------------------------------------------
// Encryption key for confidential reports (Google session only)
// ---------------------------------------------------------------------------------------------

export const encryptionRouter = Router()
encryptionRouter.use(requireAuth)

encryptionRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const row = await query('SELECT public_jwk AS "publicJwk", wrapped_private AS "wrappedPrivate", created_at AS "createdAt" FROM encryption_keys WHERE user_id = $1', [req.user!.id])
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ key: row.rows[0] ?? null })
  }),
)

const KeySchema = z.object({
  publicJwk: z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string().min(40).max(50), y: z.string().min(40).max(50) }).strict(),
  wrappedPrivate: z.string().min(40).max(4_000),
})

encryptionRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 10 }),
  route(async (req: Request, res: Response) => {
    const { publicJwk, wrappedPrivate } = parse(KeySchema, req.body)
    // A key can be set once. Replacing it would make reports encrypted to the old key unreadable.
    const saved = await query('INSERT INTO encryption_keys (user_id, public_jwk, wrapped_private) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING RETURNING user_id', [
      req.user!.id,
      JSON.stringify(publicJwk),
      wrappedPrivate,
    ])
    if (saved.rowCount === 0) throw new HttpError(409, 'You already have an encryption key. It cannot be replaced, or old reports could no longer be read.')
    res.status(201).json({ ok: true })
  }),
)

// ---------------------------------------------------------------------------------------------
// Saved searches and alerts (Google session only)
// ---------------------------------------------------------------------------------------------

export const alertsRouter = Router()
alertsRouter.use(requireAuth)

const FiltersSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().toLowerCase().max(40).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  mode: z.enum(['solo', 'team']).optional(),
  skill: z.string().trim().toLowerCase().max(32).optional(),
  project: z.string().trim().toLowerCase().max(40).optional(),
  min: z.number().int().min(0).max(1_000_000_000).optional(),
  max: z.number().int().min(0).max(1_000_000_000).optional(),
})

const SavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: FiltersSchema,
  webhookUrl: z.union([z.literal(''), z.string().trim().url().max(500)]).optional(),
})

alertsRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const rows = await query(
      `SELECT id, name, filters, webhook_url IS NOT NULL AS "hasWebhook", last_triggered_at AS "lastTriggeredAt", last_error AS "lastError", created_at AS "createdAt"
         FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

alertsRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 20 }),
  route(async (req: Request, res: Response) => {
    const body = parse(SavedSearchSchema, req.body)
    const hasFilter = Object.values(body.filters).some((v) => v !== undefined && v !== '' && v !== 0)
    if (!hasFilter) throw new HttpError(400, 'Choose at least one filter or search word to save.')
    const webhook = body.webhookUrl || null
    if (webhook && !isAllowedWebhook(webhook)) throw new HttpError(400, 'Webhooks can go to Discord, Slack or Telegram (https) only.')
    const count = await query<{ n: number }>('SELECT COUNT(*)::int AS n FROM saved_searches WHERE user_id = $1', [req.user!.id])
    if (count.rows[0].n >= 10) throw new HttpError(409, 'You can keep up to 10 saved searches.')
    const created = await query<{ id: string }>('INSERT INTO saved_searches (user_id, name, filters, webhook_url) VALUES ($1, $2, $3, $4) RETURNING id', [
      req.user!.id,
      body.name,
      JSON.stringify(body.filters),
      webhook,
    ])
    res.status(201).json({ id: created.rows[0].id })
  }),
)

alertsRouter.delete(
  '/:id',
  route(async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!isUuid(id)) throw new HttpError(404, 'Saved search not found')
    const removed = await query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [id, req.user!.id])
    if (removed.rowCount === 0) throw new HttpError(404, 'Saved search not found')
    res.json({ ok: true })
  }),
)

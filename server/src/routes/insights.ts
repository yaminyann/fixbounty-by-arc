import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { optionalAuth, requireAuth } from '../auth.js'
import { HttpError, clampInt, isUuid, parse, queryString, route } from '../lib/http.js'
import { TtlCache, rateLimit } from '../lib/limits.js'
import { SLUG_RE, canManageProject, projectRole } from '../lib/ecosystem.js'
import { deliver, isAllowedWebhook } from '../services/alerts.js'
import { WEBHOOK_EVENTS } from '../services/webhooks.js'

const PUBLIC_BOUNTY = `b.moderation_status = 'approved' AND b.metadata_verified`

// ---------------------------------------------------------------------------------------------------------------
// Project analytics and webhooks (members only), mounted under /api/projects
// ---------------------------------------------------------------------------------------------------------------

export const projectInsightsRouter = Router()

async function memberProject(req: Request, manage: boolean) {
  const slug = String(req.params.slug).toLowerCase()
  if (!SLUG_RE.test(slug)) throw new HttpError(404, 'Project not found')
  const found = await query<{ id: string; name: string }>('SELECT id, name FROM projects WHERE slug = $1', [slug])
  if (!found.rows[0]) throw new HttpError(404, 'Project not found')
  const role = await projectRole(req.user!.id, found.rows[0].id)
  if (role === null || (manage && !canManageProject(role))) throw new HttpError(403, manage ? 'Only the project owner or a manager can do this.' : 'Only project members can see this.')
  return found.rows[0]
}

projectInsightsRouter.get(
  '/:slug/analytics',
  optionalAuth,
  requireAuth,
  route(async (req: Request, res: Response) => {
    const project = await memberProject(req, false)
    const live = `b.project_id = $1 AND b.onchain_status IN (1, 2, 3, 4)`

    const [summary, response, review, categories, weekly] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS bounties, COALESCE(SUM(b.reward_amount), 0)::text AS funded, COALESCE(SUM(b.submission_count), 0)::int AS submissions,
                COUNT(*) FILTER (WHERE b.submission_count > 0)::int AS "withSubmissions", COUNT(*) FILTER (WHERE b.winner_count > 0)::int AS "withWinners",
                COUNT(*) FILTER (WHERE b.onchain_status = 4)::int AS reclaimed,
                (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a JOIN bounties b2 ON b2.id = a.bounty_id
                  WHERE b2.project_id = $1 AND a.kind = 'claimed') AS distributed
           FROM bounties b WHERE ${live}`,
        [project.id],
      ),
      query<{ hours: number | null; days: number | null }>(
        `SELECT
           (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fs.first - b.funded_at)) / 3600))::numeric, 1)::float
              FROM bounties b JOIN LATERAL (SELECT MIN(a.block_time) AS first FROM bounty_activity a WHERE a.bounty_id = b.id AND a.kind = 'submitted') fs ON fs.first IS NOT NULL
             WHERE ${live} AND b.funded_at IS NOT NULL) AS hours,
           (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (b.approved_at - fs.first)) / 86400))::numeric, 1)::float
              FROM bounties b JOIN LATERAL (SELECT MIN(a.block_time) AS first FROM bounty_activity a WHERE a.bounty_id = b.id AND a.kind = 'submitted') fs ON fs.first IS NOT NULL
             WHERE ${live} AND b.approved_at IS NOT NULL) AS days`,
        [project.id],
      ),
      query<{ hours: number | null; reviewed: number }>(
        `SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s.reviewed_at - s.created_at)) / 3600))::numeric, 1)::float AS hours, COUNT(*)::int AS reviewed
           FROM submissions s JOIN bounties b ON b.id = s.bounty_id WHERE b.project_id = $1 AND s.reviewed_at IS NOT NULL`,
        [project.id],
      ),
      query(
        `SELECT x.cat AS category, COUNT(*)::int AS bounties, COALESCE(SUM(x.subs), 0)::int AS submissions,
                COALESCE((SELECT SUM(a.amount - COALESCE(a.fee, 0)) FROM bounty_activity a JOIN bounties b2 ON b2.id = a.bounty_id
                           WHERE b2.project_id = $1 AND COALESCE(b2.category, 'uncategorised') = x.cat AND a.kind = 'claimed'), 0)::text AS paid
           FROM (SELECT COALESCE(b.category, 'uncategorised') AS cat, b.submission_count AS subs FROM bounties b WHERE ${live}) x
          GROUP BY x.cat ORDER BY COUNT(*) DESC`,
        [project.id],
      ),
      query(
        `SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
                (SELECT COUNT(*)::int FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
                  WHERE b.project_id = $1 AND a.kind = 'submitted' AND a.block_time >= w.week AND a.block_time < w.week + INTERVAL '7 days') AS submissions,
                (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
                  WHERE b.project_id = $1 AND a.kind = 'claimed' AND a.block_time >= w.week AND a.block_time < w.week + INTERVAL '7 days') AS paid
           FROM generate_series(date_trunc('week', NOW()) - INTERVAL '11 weeks', date_trunc('week', NOW()), INTERVAL '1 week') AS w(week) ORDER BY w.week`,
        [project.id],
      ),
    ])

    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      ...summary.rows[0],
      medianHoursToFirstSubmission: response.rows[0].hours,
      medianDaysToPickWinners: response.rows[0].days,
      medianReviewHours: review.rows[0].hours,
      reviewedSubmissions: review.rows[0].reviewed,
      categories: categories.rows,
      weekly: weekly.rows,
    })
  }),
)

const WebhookSchema = z.object({
  url: z.string().trim().url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
})

projectInsightsRouter.get(
  '/:slug/webhooks',
  requireAuth,
  route(async (req: Request, res: Response) => {
    const project = await memberProject(req, true)
    const rows = await query(
      `SELECT id, events, last_delivery_at AS "lastDeliveryAt", last_error AS "lastError", created_at AS "createdAt",
              regexp_replace(url, '^(https?://[^/]+/).*$', '\\1…') AS "host"
         FROM project_webhooks WHERE project_id = $1 ORDER BY created_at`,
      [project.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows, events: WEBHOOK_EVENTS })
  }),
)

projectInsightsRouter.post(
  '/:slug/webhooks',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  route(async (req: Request, res: Response) => {
    const project = await memberProject(req, true)
    const { url, events } = parse(WebhookSchema, req.body)
    if (!isAllowedWebhook(url)) throw new HttpError(400, 'Webhooks can go to Discord, Slack or Telegram (https) only.')
    const count = await query<{ n: number }>('SELECT COUNT(*)::int AS n FROM project_webhooks WHERE project_id = $1', [project.id])
    if (count.rows[0].n >= 5) throw new HttpError(409, 'A project can have up to 5 webhooks.')
    const created = await query<{ id: string }>('INSERT INTO project_webhooks (project_id, url, events, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [project.id, url, [...new Set(events)], req.user!.id])
    const error = await deliver(url, `BountyFi webhook connected for ${project.name}. You will receive: ${events.join(', ')}.`)
    await query('UPDATE project_webhooks SET last_delivery_at = NOW(), last_error = $2 WHERE id = $1', [created.rows[0].id, error])
    res.status(201).json({ id: created.rows[0].id, testDelivered: error === null })
  }),
)

projectInsightsRouter.delete(
  '/:slug/webhooks/:id',
  requireAuth,
  route(async (req: Request, res: Response) => {
    const project = await memberProject(req, true)
    const id = String(req.params.id)
    if (!isUuid(id)) throw new HttpError(404, 'Webhook not found')
    const removed = await query('DELETE FROM project_webhooks WHERE id = $1 AND project_id = $2', [id, project.id])
    if (removed.rowCount === 0) throw new HttpError(404, 'Webhook not found')
    res.json({ ok: true })
  }),
)

// ---------------------------------------------------------------------------------------------------------------
// Leaderboard: contributors ranked by USDC received, from claim events on approved public bounties
// ---------------------------------------------------------------------------------------------------------------

export const leaderboardRouter = Router()
const cache = new TtlCache<unknown[]>(15_000, 60)

leaderboardRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const period = queryString(req.query.period, 4) === '30d' ? 30 : queryString(req.query.period, 4) === '90d' ? 90 : 0
    const category = queryString(req.query.category, 40)?.toLowerCase()
    const limit = clampInt(req.query.limit, 25, 1, 100)
    const items = await cache.get(JSON.stringify([period, category, limit]), async () => {
      const params: unknown[] = []
      let where = `a.kind = 'claimed' AND ${PUBLIC_BOUNTY} AND NOT COALESCE(cp.hide_from_leaderboard, FALSE)`
      if (period > 0) {
        params.push(period)
        where += ` AND a.block_time >= NOW() - ($${params.length}::int * INTERVAL '1 day')`
      }
      if (category && /^[a-z0-9-]{1,40}$/.test(category)) {
        params.push(category)
        where += ` AND b.category = $${params.length}`
      }
      params.push(limit)
      const rows = await query(
        `SELECT a.actor_wallet AS wallet, MAX(COALESCE(cp.display_name, u.display_name)) AS name, MAX(COALESCE(cp.avatar_url, u.photo_url)) AS photo,
                SUM(a.amount - COALESCE(a.fee, 0))::text AS earned, COUNT(*)::int AS claims
           FROM bounty_activity a
           JOIN bounties b ON b.id = a.bounty_id
           LEFT JOIN wallets w ON w.address = a.actor_wallet AND w.verified
           LEFT JOIN users u ON u.id = w.user_id
           LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
          WHERE ${where}
          GROUP BY a.actor_wallet
          ORDER BY SUM(a.amount - COALESCE(a.fee, 0)) DESC, COUNT(*) DESC
          LIMIT $${params.length}`,
        params,
      )
      return rows.rows
    })
    res.setHeader('Cache-Control', 'public, max-age=15')
    res.json({ items, period: period === 0 ? 'all' : `${period}d` })
  }),
)

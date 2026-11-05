import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { clampInt, parse, route } from '../lib/http.js'

/** In-app notifications. They are written by the actions that cause them (reviews, teams, moderation, indexed chain events). */
export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 30, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const rows = await query(
      `SELECT id, kind, title, body, link, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user!.id, limit, offset],
    )
    const unread = await query<{ n: number }>('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user!.id])
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows, unread: unread.rows[0].n })
  }),
)

notificationsRouter.get(
  '/unread-count',
  route(async (req: Request, res: Response) => {
    const unread = await query<{ n: number }>('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user!.id])
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ unread: unread.rows[0].n })
  }),
)

const ReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() })

notificationsRouter.post(
  '/read',
  route(async (req: Request, res: Response) => {
    const { ids, all } = parse(ReadSchema, req.body)
    if (all) await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user!.id])
    else if (ids && ids.length > 0) await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [req.user!.id, ids])
    res.json({ ok: true })
  }),
)

import { Router, type Request, type Response } from 'express'
import { query } from '../db.js'
import { route } from '../lib/http.js'

export const categoriesRouter = Router()

/** Active categories with the number of bounties that are open for work right now. */
categoriesRouter.get(
  '/',
  route(async (_req: Request, res: Response) => {
    const rows = await query(
      `SELECT c.slug, c.name, c.description, c.icon, c.examples,
              (SELECT COUNT(*)::int FROM bounties b
                WHERE b.category = c.slug AND b.moderation_status = 'approved' AND b.metadata_verified
                  AND b.onchain_status = 1 AND b.deadline > NOW()) AS "openCount",
              (SELECT COUNT(*)::int FROM bounties b
                WHERE b.category = c.slug AND b.moderation_status = 'approved' AND b.metadata_verified
                  AND b.onchain_status IN (1, 2, 3, 4)) AS "totalCount"
         FROM categories c WHERE c.active ORDER BY c.sort_order, c.name`,
    )
    res.setHeader('Cache-Control', 'public, max-age=10')
    res.json({ items: rows.rows })
  }),
)

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { optionalAuth } from '../auth.js'
import { fetchOnchainBounty } from '../chain.js'

export const activityRouter = Router()

// GET /api/activity - List platform or user-scoped events with pagination & indexing
activityRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const actor = typeof req.query.actor === 'string' ? req.query.actor.trim().toLowerCase() : null
    const bountyIdParam = typeof req.query.bountyId === 'string' ? req.query.bountyId.trim() : null

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (actor) {
      params.push(actor)
      // Match if actor is the performer, or creator of the bounty, or submitter
      conditions.push(`(
        LOWER(a.actor_wallet) = $${params.length}
        OR LOWER(COALESCE(b.creator_wallet, '')) = $${params.length}
        OR a.user_id::text = $${params.length}
      )`)
    }

    if (bountyIdParam) {
      params.push(bountyIdParam)
      conditions.push(`(a.bounty_id::text = $${params.length} OR a.onchain_bounty_id::text = $${params.length})`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count total for pagination
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM bounty_activity a
      LEFT JOIN bounties b ON a.bounty_id = b.id
      ${whereClause}
    `
    const countRes = await query<{ total: number }>(countSql, params)
    const total = countRes.rows[0]?.total || 0

    // Query paginated rows
    params.push(limit)
    const limitIdx = params.length
    params.push(offset)
    const offsetIdx = params.length

    const sql = `
      SELECT
        a.id,
        a.bounty_id AS "bountyId",
        a.onchain_bounty_id AS "onchainId",
        a.actor_wallet AS "actorWallet",
        a.action,
        a.description,
        a.tx_hash AS "txHash",
        a.created_at AS "createdAt",
        b.title AS "bountyTitle",
        b.reward_amount::text AS "bountyReward",
        b.onchain_status AS "bountyStatus",
        u.display_name AS "actorName",
        u.photo_url AS "actorPhoto"
      FROM bounty_activity a
      LEFT JOIN bounties b ON a.bounty_id = b.id
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `

    const result = await query(sql, params)

    res.json({
      activity: result.rows,
      total,
      limit,
      offset,
      hasMore: offset + result.rows.length < total,
    })
  } catch (err) {
    console.error('[API] /api/activity error:', err)
    res.status(500).json({ error: 'Failed to retrieve activity history' })
  }
})

// POST /api/activity - Record lifecycle event and sync onchain bounty status
const RecordActivitySchema = z.object({
  onchainId: z.number().int().positive(),
  action: z.enum(['funded', 'approved', 'claimed', 'refunded', 'cancelled', 'metadata_updated', 'submitted']),
  actorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  description: z.string().min(3),
  txHash: z.string().optional(),
})

activityRouter.post('/', optionalAuth, async (req: Request, res: Response) => {
  const parsed = RecordActivitySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
    return
  }

  const { onchainId, action, actorWallet, description, txHash } = parsed.data
  const user = req.user

  try {
    // Find linked bounty
    const bountyRes = await query<{ id: string; onchain_status: number }>(
      'SELECT id, onchain_status FROM bounties WHERE onchain_id = $1',
      [onchainId]
    )

    let bountyId: string | null = null
    if (bountyRes.rows.length > 0) {
      bountyId = bountyRes.rows[0].id
    }

    // Record activity in database
    const actRes = await query(
      `
      INSERT INTO bounty_activity (
        bounty_id,
        onchain_bounty_id,
        user_id,
        actor_wallet,
        action,
        description,
        tx_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, action, description, created_at AS "createdAt"
      `,
      [
        bountyId,
        onchainId,
        user?.id || null,
        actorWallet?.toLowerCase() || null,
        action,
        description,
        txHash || null,
      ]
    )

    // Synchronize onchain status asynchronously without blocking API response
    if (bountyId) {
      fetchOnchainBounty(onchainId)
        .then(async (onchain) => {
          if (onchain) {
            await query(
              'UPDATE bounties SET onchain_status = $1, updated_at = NOW() WHERE id = $2',
              [onchain.status, bountyId]
            )
          }
        })
        .catch((err) => {
          console.warn(`[Activity] Background sync note for bounty #${onchainId}:`, err)
        })
    }

    res.status(201).json({
      success: true,
      activity: actRes.rows[0],
    })
  } catch (err) {
    console.error('[API] POST /api/activity failed:', err)
    res.status(500).json({ error: 'Failed to record activity' })
  }
})

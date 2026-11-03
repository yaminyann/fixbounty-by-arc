import { Router, type Request, type Response } from 'express'
import { query } from '../db.js'
import { requireAuth, requireLinkedWallet } from '../auth.js'
import { clampInt, route } from '../lib/http.js'
import { BOUNTY_LIST_COLUMNS } from '../services/projections.js'

export const meRouter = Router()

meRouter.use(requireAuth, requireLinkedWallet)

/** Bounties the signed-in creator posted, including ones still waiting for admin approval. */
meRouter.get(
  '/bounties',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 50, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const rows = await query(
      `SELECT ${BOUNTY_LIST_COLUMNS}, b.moderation_note AS "moderationNote", b.metadata_verified AS "metadataVerified"
         FROM bounties b
        WHERE b.creator_wallet = $1 OR b.creator_user_id = $2
        ORDER BY b.created_at DESC
        LIMIT $3 OFFSET $4`,
      [req.wallet, req.user!.id, limit, offset],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

/** Work the signed-in contributor submitted, with the bounty it belongs to. */
meRouter.get(
  '/submissions',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 50, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const rows = await query(
      `SELECT s.id, s.created_at AS "createdAt", s.position, s.notes_verified AS "notesVerified",
              s.description, s.pull_request_url AS "pullRequestUrl",
              b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus",
              b.reward_amount::text AS "rewardAmount", b.prize_payouts::text[] AS "prizePayouts",
              b.winners, b.winners_claimed AS "winnersClaimed", b.approved_at AS "approvedAt", b.deadline,
              b.moderation_status AS "moderationStatus",
              CASE
                WHEN s.position IS NOT NULL THEN 'winner'
                WHEN b.onchain_status >= 2 AND b.winner_count > 0 THEN 'not_selected'
                ELSE 'pending'
              END AS status
         FROM submissions s
         JOIN bounties b ON b.id = s.bounty_id
        WHERE s.submitter_wallet = $1
        ORDER BY s.created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.wallet, limit, offset],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

/** Headline numbers for the dashboard, from indexed chain events. */
meRouter.get(
  '/summary',
  route(async (req: Request, res: Response) => {
    const wallet = req.wallet
    const [created, work, earned, feesPaid] = await Promise.all([
      query<{ total: number; live: number; pending: number; escrowed: string }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE onchain_status IN (1, 2))::int AS live,
                COUNT(*) FILTER (WHERE moderation_status = 'pending' AND metadata_verified)::int AS pending,
                COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status = 1), 0)::text AS escrowed
           FROM bounties WHERE creator_wallet = $1`,
        [wallet],
      ),
      query<{ submitted: number; won: number }>(
        `SELECT COUNT(*)::int AS submitted, COUNT(*) FILTER (WHERE position IS NOT NULL)::int AS won
           FROM submissions WHERE submitter_wallet = $1`,
        [wallet],
      ),
      query<{ earned: string }>(
        `SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0)::text AS earned
           FROM bounty_activity WHERE kind = 'claimed' AND actor_wallet = $1`,
        [wallet],
      ),
      query<{ paid: string }>(`SELECT COALESCE(SUM(amount), 0)::text AS paid FROM platform_fees WHERE payer_wallet = $1`, [wallet]),
    ])

    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      created: created.rows[0],
      work: work.rows[0],
      earned: earned.rows[0].earned,
      feesPaid: feesPaid.rows[0].paid,
    })
  }),
)

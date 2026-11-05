import { Router, type Request, type Response } from 'express'
import { config } from '../config.js'
import { query } from '../db.js'
import { clampInt, queryString, route } from '../lib/http.js'
import { TtlCache } from '../lib/limits.js'

export const publicRouter = Router()

/** Everything the browser needs to talk to the contract; one source of truth for the deployment. */
publicRouter.get(
  '/config',
  route((_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json({
      chainId: config.chain.id,
      contractAddress: config.chain.contractAddress,
      usdcAddress: config.chain.usdcAddress,
      treasuryAddress: config.chain.treasuryAddress,
      explorerUrl: config.chain.explorerUrl,
      postFeeBps: 50,
      claimFeeBps: 500,
      claimGraceSeconds: 7 * 24 * 3600,
      reviewSeconds: 7 * 24 * 3600,
      maxWinners: 10,
      onramp: config.onramp.apiKey !== null,
    })
  }),
)

const statsCache = new TtlCache<Record<string, unknown>>(30_000, 1)

publicRouter.get(
  '/stats',
  route(async (_req: Request, res: Response) => {
    const stats = await statsCache.get('stats', async () => {
      const [bounties, paid, people] = await Promise.all([
        query<{ live: number; posted: string; submissions: number }>(
          `SELECT
             COUNT(*) FILTER (WHERE onchain_status IN (1, 2))::int AS live,
             COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status IN (1, 2, 3)), 0)::text AS posted,
             COALESCE(SUM(submission_count), 0)::int AS submissions
           FROM bounties
           WHERE moderation_status = 'approved' AND metadata_verified`,
        ),
        query<{ paid: string }>(
          `SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text AS paid
             FROM bounty_activity a
             JOIN bounties b ON b.id = a.bounty_id
            WHERE a.kind = 'claimed' AND b.moderation_status = 'approved'`,
        ),
        query<{ builders: number }>(`SELECT COUNT(DISTINCT submitter_wallet)::int AS builders FROM submissions`),
      ])
      return {
        liveBounties: bounties.rows[0].live,
        totalPosted: bounties.rows[0].posted,
        totalPaidOut: paid.rows[0].paid,
        submissions: bounties.rows[0].submissions,
        builders: people.rows[0].builders,
      }
    })
    res.setHeader('Cache-Control', 'public, max-age=30')
    res.json(stats)
  }),
)

publicRouter.get(
  '/activity',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 30, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const wallet = queryString(req.query.wallet, 42)?.toLowerCase()
    const bountyId = clampInt(req.query.bountyId, 0, 0, 2_147_483_647)

    const params: unknown[] = []
    let where = `b.moderation_status = 'approved' AND b.metadata_verified`
    if (wallet && /^0x[0-9a-f]{40}$/.test(wallet)) {
      params.push(wallet)
      where += ` AND (a.actor_wallet = $${params.length} OR b.creator_wallet = $${params.length})`
    }
    if (bountyId > 0) {
      params.push(bountyId)
      where += ` AND a.onchain_id = $${params.length}`
    }
    params.push(limit, offset)

    const rows = await query<{ total: string }>(
      `SELECT a.id, a.onchain_id::int AS "onchainId", a.kind, a.actor_wallet AS "actorWallet", a.position,
              a.amount::text AS amount, a.fee::text AS fee, a.tx_hash AS "txHash", a.block_time AS "time",
              b.title AS "bountyTitle", COUNT(*) OVER()::text AS total
         FROM bounty_activity a
         JOIN bounties b ON b.id = a.bounty_id
        WHERE ${where}
        ORDER BY a.block_time DESC, a.log_index DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.setHeader('Cache-Control', 'public, max-age=5')
    res.json({
      items: rows.rows.map(({ total: _t, ...rest }) => rest),
      total,
      limit,
      offset,
    })
  }),
)

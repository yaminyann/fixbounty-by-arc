import { Router, type Request, type Response, type NextFunction } from 'express'
import { query } from '../db.js'
import { optionalAuth } from '../auth.js'

export const adminRouter = Router()

// Read admin credentials from environment with secure defaults
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || 'fixbounty_admin_2026_arc'
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || 'yaminv75@gmail.com,admin@fixbounty.io')
  .toLowerCase()
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

// Middleware: Verify Admin Access via Passkey Header OR Whitelisted Google Email
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers['x-admin-key'] as string | undefined

  // 1. Check Passkey header
  if (adminKey && (adminKey === ADMIN_PASSWORD || adminKey === process.env.ADMIN_SECRET)) {
    return next()
  }

  // 2. Check Whitelisted Authenticated Google Email
  if (req.user?.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return next()
  }

  res.status(401).json({
    error: 'Unauthorized. Admin credentials or authorized admin email required.',
  })
}

// POST /api/admin/verify - Verify admin credentials
adminRouter.post('/verify', optionalAuth, (req: Request, res: Response) => {
  const { password } = req.body || {}
  const adminKey = (req.headers['x-admin-key'] as string) || password

  if (adminKey && (adminKey === ADMIN_PASSWORD || adminKey === process.env.ADMIN_SECRET)) {
    res.json({
      valid: true,
      authMethod: 'passkey',
      message: 'Admin authorization verified.',
    })
    return
  }

  if (req.user?.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    res.json({
      valid: true,
      authMethod: 'google_oauth',
      email: req.user.email,
      message: 'Admin authorization granted via whitelisted Google profile.',
    })
    return
  }

  res.status(403).json({
    valid: false,
    error: 'Invalid admin credentials.',
  })
})

// GET /api/admin/stats - Global platform analytics & KPI summary
adminRouter.get('/stats', optionalAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    // 1. Bounty stats & status distribution
    const bountyStatsRes = await query<{
      total_bounties: number
      total_rewards: string
      open_count: number
      funded_count: number
      approved_count: number
      claimed_count: number
      refunded_count: number
      cancelled_count: number
    }>(`
      SELECT
        COUNT(*)::int AS total_bounties,
        COALESCE(SUM(reward_amount), 0)::text AS total_rewards,
        COUNT(*) FILTER (WHERE onchain_status = 0)::int AS open_count,
        COUNT(*) FILTER (WHERE onchain_status = 1)::int AS funded_count,
        COUNT(*) FILTER (WHERE onchain_status = 2)::int AS approved_count,
        COUNT(*) FILTER (WHERE onchain_status = 3)::int AS claimed_count,
        COUNT(*) FILTER (WHERE onchain_status = 4)::int AS refunded_count,
        COUNT(*) FILTER (WHERE onchain_status = 5)::int AS cancelled_count
      FROM bounties
    `)

    // 2. Submissions stats & status distribution
    const subStatsRes = await query<{
      total_submissions: number
      pending_count: number
      approved_count: number
      rejected_count: number
    }>(`
      SELECT
        COUNT(*)::int AS total_submissions,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_count
      FROM submissions
    `)

    // 3. User & wallet counts
    const userStatsRes = await query<{
      total_users: number
      total_creators: number
      total_submitters: number
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(DISTINCT creator_wallet)::int FROM bounties WHERE creator_wallet IS NOT NULL) AS total_creators,
        (SELECT COUNT(DISTINCT submitter_wallet)::int FROM submissions WHERE submitter_wallet IS NOT NULL) AS total_submitters
    `)

    const b = bountyStatsRes.rows[0] || {
      total_bounties: 0,
      total_rewards: '0',
      open_count: 0,
      funded_count: 0,
      approved_count: 0,
      claimed_count: 0,
      refunded_count: 0,
      cancelled_count: 0,
    }

    const s = subStatsRes.rows[0] || {
      total_submissions: 0,
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
    }

    const u = userStatsRes.rows[0] || {
      total_users: 0,
      total_creators: 0,
      total_submitters: 0,
    }

    res.json({
      success: true,
      bounties: {
        total: b.total_bounties,
        totalRewards: b.total_rewards,
        open: b.open_count,
        funded: b.funded_count,
        approved: b.approved_count,
        claimed: b.claimed_count,
        refunded: b.refunded_count,
        cancelled: b.cancelled_count,
      },
      submissions: {
        total: s.total_submissions,
        pending: s.pending_count,
        approved: s.approved_count,
        rejected: s.rejected_count,
      },
      users: {
        total: u.total_users,
        uniqueCreators: u.total_creators,
        uniqueSubmitters: u.total_submitters,
      },
      system: {
        network: 'Arc Testnet (Chain ID 5042002)',
        contractAddress: process.env.BOUNTY_BOARD_ADDRESS || '0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb',
        usdcAddress: '0x3600000000000000000000000000000000000000',
        rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io',
      },
    })
  } catch (err) {
    console.error('[Admin API] Failed to fetch stats:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/bounties - Paginated bounties across the platform
adminRouter.get('/bounties', optionalAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const status = req.query.status !== undefined && req.query.status !== 'all' ? Number(req.query.status) : undefined
    const search = (req.query.search as string)?.trim()

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (status !== undefined && !isNaN(status)) {
      params.push(status)
      conditions.push(`b.onchain_status = $${params.length}`)
    }

    if (search) {
      params.push(`%${search}%`)
      conditions.push(`(
        b.title ILIKE $${params.length}
        OR b.creator_wallet ILIKE $${params.length}
        OR b.description ILIKE $${params.length}
        OR $${params.length} = ANY(b.tags)
      )`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count query
    const countRes = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM bounties b ${whereClause}`,
      params
    )
    const total = countRes.rows[0]?.total || 0

    // Data query
    params.push(limit, offset)
    const dataSql = `
      SELECT
        b.id,
        b.onchain_id AS "onchainId",
        b.creator_user_id AS "creatorUserId",
        b.creator_wallet AS "creatorWallet",
        b.title,
        b.description,
        b.reward_amount::text AS "rewardAmount",
        b.token_symbol AS "tokenSymbol",
        b.deadline,
        b.tags,
        b.links,
        b.tx_hash AS "txHash",
        b.onchain_status AS "onchainStatus",
        b.created_at AS "createdAt",
        b.updated_at AS "updatedAt",
        (SELECT COUNT(*)::int FROM submissions s WHERE s.bounty_id = b.id) AS "submissionsCount",
        u.email AS "creatorEmail",
        u.display_name AS "creatorDisplayName"
      FROM bounties b
      LEFT JOIN users u ON b.creator_user_id = u.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `

    const dataRes = await query(dataSql, params)

    res.json({
      success: true,
      bounties: dataRes.rows,
      total,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[Admin API] Failed to fetch bounties:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/submissions - Paginated submissions across the platform
adminRouter.get('/submissions', optionalAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const status = (req.query.status as string)?.trim()
    const search = (req.query.search as string)?.trim()

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (status && status !== 'all') {
      params.push(status)
      conditions.push(`s.status = $${params.length}`)
    }

    if (search) {
      params.push(`%${search}%`)
      conditions.push(`(
        s.submitter_wallet ILIKE $${params.length}
        OR b.title ILIKE $${params.length}
        OR s.pull_request_url ILIKE $${params.length}
        OR s.description ILIKE $${params.length}
      )`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count
    const countRes = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM submissions s
       JOIN bounties b ON s.bounty_id = b.id
       ${whereClause}`,
      params
    )
    const total = countRes.rows[0]?.total || 0

    // Data query
    params.push(limit, offset)
    const dataSql = `
      SELECT
        s.id,
        s.bounty_id AS "bountyId",
        s.onchain_bounty_id AS "onchainId",
        s.submitter_user_id AS "submitterUserId",
        s.submitter_wallet AS "submitterWallet",
        s.description,
        s.pull_request_url AS "pullRequestUrl",
        s.attachments,
        s.status,
        s.tx_hash AS "txHash",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        b.title AS "bountyTitle",
        b.reward_amount::text AS "bountyReward",
        b.onchain_status AS "bountyStatus",
        b.creator_wallet AS "bountyCreatorWallet",
        u.email AS "submitterEmail",
        u.display_name AS "submitterDisplayName"
      FROM submissions s
      JOIN bounties b ON s.bounty_id = b.id
      LEFT JOIN users u ON s.submitter_user_id = u.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `

    const dataRes = await query(dataSql, params)

    res.json({
      success: true,
      submissions: dataRes.rows,
      total,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[Admin API] Failed to fetch submissions:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

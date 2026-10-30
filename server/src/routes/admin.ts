import { Router, type Request, type Response, type NextFunction } from 'express'
import { query } from '../db.js'
import { optionalAuth } from '../auth.js'

export const adminRouter = Router()

// Read admin credentials from environment with secure defaults
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || 'taskfi_admin_2026_arc'
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || 'yaminv75@gmail.com,admin@taskfi.io,admin@fixbounty.io')
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

// Helper to convert 6-decimal USDC base units (e.g. "2500000") to standard decimal string ("2.50")
function baseUnitsToUsdc(raw: string | number | null | undefined): string {
  if (!raw) return '0.00'
  const val = Number(raw)
  if (isNaN(val) || val <= 0) return '0.00'
  return (val / 1_000_000).toFixed(2)
}

// GET /api/admin/stats - Global platform analytics & KPI summary
adminRouter.get('/stats', optionalAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    // 1. Bounty stats & status distribution with explicit 6-decimal USDC metrics
    const bountyStatsRes = await query<{
      total_bounties: number
      total_rewards_raw: string
      total_funded_raw: string
      total_claimed_raw: string
      total_active_raw: string
      total_refunded_raw: string
      open_count: number
      funded_count: number
      approved_count: number
      claimed_count: number
      refunded_count: number
      cancelled_count: number
    }>(`
      SELECT
        COUNT(*)::int AS total_bounties,
        COALESCE(SUM(reward_amount), 0)::text AS total_rewards_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status IN (1, 2, 3)), 0)::text AS total_funded_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status = 3), 0)::text AS total_claimed_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status IN (1, 2)), 0)::text AS total_active_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status = 4), 0)::text AS total_refunded_raw,
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

    // 4. Platform fee events aggregate
    const feeAggregateRes = await query<{
      total_fee_events: number
      total_fees_raw: string
    }>(`
      SELECT
        COUNT(*)::int AS total_fee_events,
        COALESCE(SUM(fee_amount), 0)::text AS total_fees_raw
      FROM fee_events
    `)

    const b = bountyStatsRes.rows[0] || {
      total_bounties: 0,
      total_rewards_raw: '0',
      total_funded_raw: '0',
      total_claimed_raw: '0',
      total_active_raw: '0',
      total_refunded_raw: '0',
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

    const f = feeAggregateRes.rows[0] || {
      total_fee_events: 0,
      total_fees_raw: '0',
    }

    res.json({
      success: true,
      bounties: {
        total: b.total_bounties,
        totalRewardsRaw: b.total_rewards_raw,
        totalRewards: baseUnitsToUsdc(b.total_rewards_raw), // normalized to standard USDC string (e.g. "2.50")
        totalFunded: baseUnitsToUsdc(b.total_funded_raw),
        totalClaimed: baseUnitsToUsdc(b.total_claimed_raw),
        totalActiveEscrow: baseUnitsToUsdc(b.total_active_raw),
        totalRefunded: baseUnitsToUsdc(b.total_refunded_raw),
        open: b.open_count,
        funded: b.funded_count,
        approved: b.approved_count,
        claimed: b.claimed_count,
        refunded: b.refunded_count,
        cancelled: b.cancelled_count,
      },
      revenue: {
        totalEscrowFundedUsdc: baseUnitsToUsdc(b.total_funded_raw),
        contributorPayoutsSettledUsdc: baseUnitsToUsdc(b.total_claimed_raw),
        activeEscrowLockedUsdc: baseUnitsToUsdc(b.total_active_raw),
        refundedToCreatorsUsdc: baseUnitsToUsdc(b.total_refunded_raw),
        collectedPlatformFeesUsdc: baseUnitsToUsdc(f.total_fees_raw),
        pendingPlatformFeesUsdc: '0.00',
        feeEventsCount: f.total_fee_events,
        network: 'Arc Testnet (Chain ID 5042002)',
        activeContractModel: 'BountyBoard V1: 0% Non-Custodial Direct Escrow (100% Payout to Developers)',
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

// =============================================================================
// Moderation & Platform Revenue Endpoints
// =============================================================================

// GET /api/admin/pending - List bounties awaiting moderation
adminRouter.get('/pending', optionalAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `
      SELECT
        b.id,
        b.onchain_id AS "bounty_id",
        b.onchain_id AS "onchainId",
        b.title,
        b.description,
        b.reward_amount::text AS "rewardAmount",
        b.creator_wallet AS "creatorWallet",
        b.category_slug AS "category_slug",
        c.name AS "category_name",
        b.tags,
        b.image_url AS "imageUrl",
        b.moderation_status AS "moderationStatus",
        b.created_at AS "created_at"
      FROM bounties b
      LEFT JOIN categories c ON c.slug = b.category_slug
      WHERE b.moderation_status = 'pending'
      ORDER BY b.created_at ASC
      `
    )
    res.json({ bounties: rows })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/admin/bounties/:id/approve - Approve pending bounty
adminRouter.post('/bounties/:id/approve', optionalAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const isNumeric = /^\d+$/.test(id)
    const { note } = req.body || {}
    const adminUid = req.user?.firebase_uid || req.user?.id || 'admin_passkey'

    await query(
      `
      UPDATE bounties
      SET
        moderation_status = 'approved',
        moderation_note = $1,
        moderated_by = $2,
        moderated_at = NOW(),
        updated_at = NOW()
      WHERE ${isNumeric ? 'onchain_id = $3' : 'id = $3'}
      `,
      [note ?? null, adminUid, isNumeric ? Number(id) : id]
    )

    await query(
      `
      INSERT INTO admin_log (admin_uid, action, target_type, target_id, detail, notes)
      VALUES ($1, 'approve_bounty', 'bounty', $2, $3::jsonb, $4)
      `,
      [adminUid, String(id), JSON.stringify({ note }), note || 'Bounty approved for Explore']
    )

    res.json({ ok: true, success: true, message: `Bounty #${id} approved.` })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/admin/bounties/:id/reject - Reject bounty with mandatory reason
adminRouter.post('/bounties/:id/reject', optionalAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const isNumeric = /^\d+$/.test(id)
    const { note } = req.body || {}

    if (!note || typeof note !== 'string' || !note.trim()) {
      res.status(400).json({ error: 'Rejection reason note is required.' })
      return
    }

    const adminUid = req.user?.firebase_uid || req.user?.id || 'admin_passkey'

    await query(
      `
      UPDATE bounties
      SET
        moderation_status = 'rejected',
        moderation_note = $1,
        moderated_by = $2,
        moderated_at = NOW(),
        updated_at = NOW()
      WHERE ${isNumeric ? 'onchain_id = $3' : 'id = $3'}
      `,
      [note.trim(), adminUid, isNumeric ? Number(id) : id]
    )

    await query(
      `
      INSERT INTO admin_log (admin_uid, action, target_type, target_id, detail, notes)
      VALUES ($1, 'reject_bounty', 'bounty', $2, $3::jsonb, $4)
      `,
      [adminUid, String(id), JSON.stringify({ note: note.trim() }), note.trim()]
    )

    res.json({ ok: true, success: true, message: `Bounty #${id} rejected.` })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/revenue - Platform fee summary & financial transparency ledger
adminRouter.get('/revenue', optionalAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    // 1. Escrow Volume Aggregate from Bounties
    const escrowRes = await query<{
      total_funded_raw: string
      total_claimed_raw: string
      total_active_raw: string
      total_refunded_raw: string
    }>(`
      SELECT
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status IN (1, 2, 3)), 0)::text AS total_funded_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status = 3), 0)::text AS total_claimed_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status IN (1, 2)), 0)::text AS total_active_raw,
        COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status = 4), 0)::text AS total_refunded_raw
      FROM bounties
    `)
    const esc = escrowRes.rows[0]

    // 2. Verified Protocol Fee Events from Ledger
    const summaryRes = await query<{
      total_claims: number
      total_fees_raw: string
      total_rewards_raw: string
      network: string
    }>(
      `
      SELECT
        COUNT(*)::int AS total_claims,
        COALESCE(SUM(fee_amount), 0)::text AS total_fees_raw,
        COALESCE(SUM(reward_amount), 0)::text AS total_rewards_raw,
        network
      FROM fee_events
      GROUP BY network
      `
    )

    const recentRes = await query(
      `
      SELECT
        id,
        bounty_id AS "bounty_id",
        tx_hash AS "tx_hash",
        block_number AS "block_number",
        contributor_addr AS "contributor_addr",
        fee_amount::text AS "fee_amount",
        reward_amount::text AS "reward_amount",
        treasury_addr AS "treasury_addr",
        network,
        recorded_at AS "recorded_at"
      FROM fee_events
      ORDER BY recorded_at DESC
      LIMIT 25
      `
    )

    const normalizedSummary = summaryRes.rows.map((row) => ({
      network: row.network,
      total_claims: String(row.total_claims),
      total_fees_raw: row.total_fees_raw,
      total_fees: baseUnitsToUsdc(row.total_fees_raw),
      total_rewards_raw: row.total_rewards_raw,
      total_rewards: baseUnitsToUsdc(row.total_rewards_raw),
    }))

    const totalCollectedFeesRaw = summaryRes.rows.reduce(
      (sum, r) => sum + (Number(r.total_fees_raw) || 0),
      0
    )

    res.json({
      success: true,
      financials: {
        totalEscrowFunded: baseUnitsToUsdc(esc?.total_funded_raw),
        contributorPayoutsSettled: baseUnitsToUsdc(esc?.total_claimed_raw),
        activeEscrowLocked: baseUnitsToUsdc(esc?.total_active_raw),
        refundedToCreators: baseUnitsToUsdc(esc?.total_refunded_raw),
        collectedPlatformFees: baseUnitsToUsdc(totalCollectedFeesRaw),
        pendingPlatformFees: '0.00',
        feeEventsCount: recentRes.rows.length,
      },
      summary: normalizedSummary,
      recent: recentRes.rows.map((r: any) => ({
        ...r,
        fee_amount_usdc: baseUnitsToUsdc(r.fee_amount),
        reward_amount_usdc: baseUnitsToUsdc(r.reward_amount),
      })),
      v1_note: 'Active primary contract BountyBoard V1 (0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb) operates under a 0% non-custodial fee model where 100% of escrowed USDC is settled directly to approved contributors.',
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/admin/fee-events - Record on-chain claim fee event
adminRouter.post('/fee-events', optionalAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      bountyId,
      txHash,
      blockNumber,
      contributorAddr,
      rewardAmount,
      feeAmount,
      treasuryAddr,
      network,
    } = req.body || {}

    if (!bountyId || !txHash || !contributorAddr || !rewardAmount) {
      res.status(400).json({ error: 'Missing required fee event parameters.' })
      return
    }

    await query(
      `
      INSERT INTO fee_events (
        bounty_id,
        tx_hash,
        block_number,
        contributor_addr,
        reward_amount,
        fee_amount,
        treasury_addr,
        network
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tx_hash) DO NOTHING
      `,
      [
        Number(bountyId),
        txHash,
        blockNumber || 0,
        contributorAddr.toLowerCase(),
        rewardAmount,
        feeAmount || 0,
        treasuryAddr || '0x0000000000000000000000000000000000000000',
        network || 'testnet',
      ]
    )

    res.json({ ok: true, success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/log - Fetch admin moderation and audit trail
adminRouter.get('/log', optionalAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `
      SELECT
        al.id,
        al.admin_uid AS "admin_uid",
        al.action,
        al.target_type AS "target_type",
        al.target_id AS "target_id",
        al.detail,
        al.notes,
        al.created_at AS "created_at",
        u.display_name AS "display_name",
        u.email
      FROM admin_log al
      LEFT JOIN users u ON u.firebase_uid = al.admin_uid OR u.id::text = al.admin_uid
      ORDER BY al.created_at DESC
      LIMIT 50
      `
    )
    res.json({ log: result.rows })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})


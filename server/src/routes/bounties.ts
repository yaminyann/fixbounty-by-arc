import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import { fetchOnchainBounty, verifyTxReceipt } from '../chain.js'

export const bountiesRouter = Router()

// GET /api/bounties - List bounties with search and filters
bountiesRouter.get('/', async (req: Request, res: Response) => {
  const status = req.query.status !== undefined ? Number(req.query.status) : undefined
  const search = (req.query.search as string)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  let sql = `
    SELECT
      b.id,
      b.onchain_id AS "onchainId",
      b.creator_user_id AS "creatorUserId",
      b.creator_wallet AS "creatorWallet",
      b.title,
      b.description,
      b.acceptance_criteria AS "acceptanceCriteria",
      b.reward_amount::text AS "rewardAmount",
      b.token_symbol AS "tokenSymbol",
      b.token_address AS "tokenAddress",
      b.deadline,
      b.tags,
      b.links,
      b.tx_hash AS "txHash",
      b.onchain_status AS "onchainStatus",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      (SELECT COUNT(*)::int FROM submissions s WHERE s.bounty_id = b.id) AS "submissionsCount"
    FROM bounties b
    WHERE 1=1
  `
  const params: unknown[] = []

  if (status !== undefined && !isNaN(status)) {
    params.push(status)
    sql += ` AND b.onchain_status = $${params.length}`
  }

  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (b.title ILIKE $${params.length} OR b.description ILIKE $${params.length} OR $${params.length} = ANY(b.tags))`
  }

  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  params.push(limit, offset)

  const result = await query(sql, params)
  res.json({
    bounties: result.rows,
    count: result.rows.length,
    limit,
    offset,
  })
})

// GET /api/bounties/creator/:identifier - List bounties for specific creator (wallet or UID)
bountiesRouter.get('/creator/:identifier', async (req: Request, res: Response) => {
  const rawId = req.params.identifier
  const identifier = (Array.isArray(rawId) ? rawId[0] : String(rawId)).toLowerCase()
  const result = await query(
    `
    SELECT
      b.id,
      b.onchain_id AS "onchainId",
      b.creator_user_id AS "creatorUserId",
      b.creator_wallet AS "creatorWallet",
      b.title,
      b.description,
      b.acceptance_criteria AS "acceptanceCriteria",
      b.reward_amount::text AS "rewardAmount",
      b.token_symbol AS "tokenSymbol",
      b.token_address AS "tokenAddress",
      b.deadline,
      b.tags,
      b.links,
      b.tx_hash AS "txHash",
      b.onchain_status AS "onchainStatus",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      (SELECT COUNT(*)::int FROM submissions s WHERE s.bounty_id = b.id) AS "submissionsCount"
    FROM bounties b
    LEFT JOIN users u ON b.creator_user_id = u.id
    WHERE b.creator_wallet = $1
       OR u.firebase_uid = $1
       OR b.creator_user_id::text = $1
    ORDER BY b.created_at DESC
    `,
    [identifier]
  )

  res.json({ bounties: result.rows })
})

// GET /api/bounties/:id - Get single bounty by internal UUID or onchain ID
bountiesRouter.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const rawParam = req.params.id
  const param = Array.isArray(rawParam) ? rawParam[0] : String(rawParam)
  const isNumeric = /^\d+$/.test(param)

  const sql = `
    SELECT
      b.id,
      b.onchain_id AS "onchainId",
      b.creator_user_id AS "creatorUserId",
      b.creator_wallet AS "creatorWallet",
      b.title,
      b.description,
      b.acceptance_criteria AS "acceptanceCriteria",
      b.reward_amount::text AS "rewardAmount",
      b.token_symbol AS "tokenSymbol",
      b.token_address AS "tokenAddress",
      b.deadline,
      b.tags,
      b.links,
      b.tx_hash AS "txHash",
      b.onchain_status AS "onchainStatus",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      (SELECT COUNT(*)::int FROM submissions s WHERE s.bounty_id = b.id) AS "submissionsCount"
    FROM bounties b
    WHERE ${isNumeric ? 'b.onchain_id = $1' : 'b.id = $1'}
  `

  const result = await query(sql, [isNumeric ? Number(param) : param])
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Bounty not found in database' })
    return
  }

  res.json({ bounty: result.rows[0] })
})

// POST /api/bounties - Create or sync bounty record
const CreateBountySchema = z.object({
  onchainId: z.number().int().positive().optional(),
  creatorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  acceptanceCriteria: z.string().min(5),
  rewardAmount: z.string().regex(/^\d+$/), // string base units (e.g. "2500000")
  deadline: z.string(), // ISO string or timestamp
  tags: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  txHash: z.string().optional(),
})

bountiesRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = CreateBountySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
    return
  }

  const {
    onchainId,
    creatorWallet,
    title,
    description,
    acceptanceCriteria,
    rewardAmount,
    deadline,
    tags,
    links,
    txHash,
  } = parsed.data

  const user = req.user!
  const normalizedWallet = creatorWallet.toLowerCase()

  // If onchainId provided, optionally verify against Arc Testnet
  let initialStatus = 0 // Open
  if (onchainId) {
    const onchainData = await fetchOnchainBounty(onchainId)
    if (onchainData) {
      initialStatus = onchainData.status
      if (onchainData.creator.toLowerCase() !== normalizedWallet) {
        console.warn(`[Bounty Save] Onchain creator mismatch for #${onchainId}: expected ${onchainData.creator}, got ${normalizedWallet}`)
      }
    }
  }

  if (txHash) {
    await verifyTxReceipt(txHash)
  }

  const deadlineDate = new Date(deadline)

  const savedBounty = await withTransaction(async (client) => {
    let result
    if (onchainId) {
      result = await client.query(
        `
        INSERT INTO bounties (
          onchain_id,
          creator_user_id,
          creator_wallet,
          title,
          description,
          acceptance_criteria,
          reward_amount,
          deadline,
          tags,
          links,
          tx_hash,
          onchain_status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (onchain_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          acceptance_criteria = EXCLUDED.acceptance_criteria,
          reward_amount = EXCLUDED.reward_amount,
          deadline = EXCLUDED.deadline,
          tags = EXCLUDED.tags,
          links = EXCLUDED.links,
          tx_hash = COALESCE(EXCLUDED.tx_hash, bounties.tx_hash),
          onchain_status = EXCLUDED.onchain_status,
          updated_at = NOW()
        RETURNING
          id,
          onchain_id AS "onchainId",
          creator_user_id AS "creatorUserId",
          creator_wallet AS "creatorWallet",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          reward_amount::text AS "rewardAmount",
          token_symbol AS "tokenSymbol",
          token_address AS "tokenAddress",
          deadline,
          tags,
          links,
          tx_hash AS "txHash",
          onchain_status AS "onchainStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        `,
        [
          onchainId,
          user.id,
          normalizedWallet,
          title,
          description,
          acceptanceCriteria,
          rewardAmount,
          deadlineDate,
          tags,
          links,
          txHash || null,
          initialStatus,
        ]
      )
    } else {
      result = await client.query(
        `
        INSERT INTO bounties (
          creator_user_id,
          creator_wallet,
          title,
          description,
          acceptance_criteria,
          reward_amount,
          deadline,
          tags,
          links,
          tx_hash,
          onchain_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id,
          onchain_id AS "onchainId",
          creator_user_id AS "creatorUserId",
          creator_wallet AS "creatorWallet",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          reward_amount::text AS "rewardAmount",
          token_symbol AS "tokenSymbol",
          token_address AS "tokenAddress",
          deadline,
          tags,
          links,
          tx_hash AS "txHash",
          onchain_status AS "onchainStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        `,
        [
          user.id,
          normalizedWallet,
          title,
          description,
          acceptanceCriteria,
          rewardAmount,
          deadlineDate,
          tags,
          links,
          txHash || null,
          initialStatus,
        ]
      )
    }

    const bounty = result.rows[0]

    // Log creation activity
    await client.query(
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
      VALUES ($1, $2, $3, $4, 'created', $5, $6)
      `,
      [
        bounty.id,
        onchainId || null,
        user.id,
        normalizedWallet,
        `Bounty created: ${title}`,
        txHash || null,
      ]
    )

    return bounty
  })

  res.status(201).json({
    success: true,
    bounty: savedBounty,
    message: 'Bounty successfully saved and linked to PostgreSQL.',
  })
})

// PUT /api/bounties/:id - Update bounty description / criteria (creator only)
const UpdateBountySchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().min(10).optional(),
  acceptanceCriteria: z.string().min(5).optional(),
  tags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
})

bountiesRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const rawParam = req.params.id
  const param = Array.isArray(rawParam) ? rawParam[0] : String(rawParam)
  const isNumeric = /^\d+$/.test(param)
  const user = req.user!

  const parsed = UpdateBountySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
    return
  }

  // Find bounty and verify ownership
  const findRes = await query(
    `SELECT b.*, w.address AS linked_wallet
     FROM bounties b
     LEFT JOIN wallets w ON w.user_id = $1 AND w.address = b.creator_wallet
     WHERE ${isNumeric ? 'b.onchain_id = $2' : 'b.id = $2'}`,
    [user.id, isNumeric ? Number(param) : param]
  )

  if (findRes.rows.length === 0) {
    res.status(404).json({ error: 'Bounty not found' })
    return
  }

  const bounty = findRes.rows[0]

  // Allow edit if authenticated user is creatorUserId OR has linked the creatorWallet
  const isOwner = bounty.creator_user_id === user.id || Boolean(bounty.linked_wallet)
  if (!isOwner) {
    res.status(403).json({ error: 'Unauthorized: only the bounty creator can update metadata' })
    return
  }

  const updates = parsed.data
  const updateRes = await query(
    `
    UPDATE bounties
    SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      acceptance_criteria = COALESCE($3, acceptance_criteria),
      tags = COALESCE($4, tags),
      links = COALESCE($5, links),
      updated_at = NOW()
    WHERE id = $6
    RETURNING
      id,
      onchain_id AS "onchainId",
      creator_user_id AS "creatorUserId",
      creator_wallet AS "creatorWallet",
      title,
      description,
      acceptance_criteria AS "acceptanceCriteria",
      reward_amount::text AS "rewardAmount",
      token_symbol AS "tokenSymbol",
      token_address AS "tokenAddress",
      deadline,
      tags,
      links,
      tx_hash AS "txHash",
      onchain_status AS "onchainStatus",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `,
    [
      updates.title || null,
      updates.description || null,
      updates.acceptanceCriteria || null,
      updates.tags || null,
      updates.links || null,
      bounty.id,
    ]
  )

  res.json({
    success: true,
    bounty: updateRes.rows[0],
    message: 'Bounty metadata successfully updated.',
  })
})

// POST /api/bounties/:id/sync - Synchronize onchain status from Arc Testnet
bountiesRouter.post('/:id/sync', async (req: Request, res: Response) => {
  const rawParam = req.params.id
  const param = Array.isArray(rawParam) ? rawParam[0] : String(rawParam)
  const isNumeric = /^\d+$/.test(param)

  const findRes = await query<{ id: string; onchain_id: number; onchain_status: number }>(
    `SELECT id, onchain_id, onchain_status FROM bounties WHERE ${isNumeric ? 'onchain_id = $1' : 'id = $1'}`,
    [isNumeric ? Number(param) : param]
  )

  if (findRes.rows.length === 0 || !findRes.rows[0].onchain_id) {
    res.status(404).json({ error: 'Bounty not found or lacks onchain ID' })
    return
  }

  const bounty = findRes.rows[0]
  const onchainData = await fetchOnchainBounty(bounty.onchain_id)

  if (!onchainData) {
    res.status(502).json({ error: 'Unable to query Arc Testnet RPC' })
    return
  }

  await query(
    'UPDATE bounties SET onchain_status = $1, updated_at = NOW() WHERE id = $2',
    [onchainData.status, bounty.id]
  )

  res.json({
    success: true,
    onchainId: bounty.onchain_id,
    previousStatus: bounty.onchain_status,
    currentStatus: onchainData.status,
  })
})

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'
import { fetchOnchainBounty, verifyTxReceipt, syncOnchainBounties } from '../chain.js'

export const bountiesRouter = Router()

// GET /api/bounties/categories - List all bounty categories
bountiesRouter.get('/categories', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT id, slug, name, description, color FROM categories ORDER BY id ASC'
    )
    res.json({ categories: result.rows })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/bounties - List bounties with search and filters
bountiesRouter.get('/', async (req: Request, res: Response) => {
  // Trigger background onchain sync (throttled to 15s)
  syncOnchainBounties(false).catch(() => {})

  const status = req.query.status !== undefined && req.query.status !== 'all' ? Number(req.query.status) : undefined
  const category = (req.query.category as string)?.trim()
  const moderation = (req.query.moderation_status as string)?.trim()
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
      b.objectives,
      b.requirements,
      b.rules,
      b.eligibility,
      b.deliverables,
      b.submission_instructions AS "submissionInstructions",
      b.reward_amount::text AS "rewardAmount",
      b.token_symbol AS "tokenSymbol",
      b.token_address AS "tokenAddress",
      b.deadline,
      b.tags,
      b.links,
      b.tx_hash AS "txHash",
      b.onchain_status AS "onchainStatus",
      b.category_slug AS "categorySlug",
      c.name AS "categoryName",
      c.color AS "categoryColor",
      COALESCE(b.moderation_status, 'approved') AS "moderationStatus",
      b.moderation_note AS "moderationNote",
      b.image_url AS "imageUrl",
      b.contract_version AS "contractVersion",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      (SELECT COUNT(*)::int FROM submissions s WHERE s.bounty_id = b.id) AS "submissionsCount"
    FROM bounties b
    LEFT JOIN categories c ON c.slug = b.category_slug
    WHERE 1=1
  `
  const params: unknown[] = []

  if (status !== undefined && !isNaN(status)) {
    params.push(status)
    sql += ` AND b.onchain_status = $${params.length}`
  }

  if (category && category !== 'all') {
    params.push(category)
    sql += ` AND b.category_slug = $${params.length}`
  }

  // Filter by moderation: if specified, use it; otherwise default to approved
  if (moderation && moderation !== 'all') {
    params.push(moderation)
    sql += ` AND b.moderation_status = $${params.length}`
  } else if (!moderation) {
    sql += ` AND (b.moderation_status = 'approved' OR b.moderation_status IS NULL)`
  }

  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (b.title ILIKE $${params.length} OR b.description ILIKE $${params.length} OR $${params.length} = ANY(b.tags))`
  }

  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  params.push(limit, offset)

  let result = await query(sql, params)

  // If table is currently empty, trigger synchronous sync and re-query once
  if (result.rows.length === 0 && !search && (status === undefined || isNaN(status))) {
    try {
      const syncRes = await syncOnchainBounties(true)
      if (syncRes.synced > 0) {
        result = await query(sql, params)
      }
    } catch {
      // Ignore
    }
  }

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
      b.objectives,
      b.requirements,
      b.rules,
      b.eligibility,
      b.deliverables,
      b.submission_instructions AS "submissionInstructions",
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
      b.objectives,
      b.requirements,
      b.rules,
      b.eligibility,
      b.deliverables,
      b.submission_instructions AS "submissionInstructions",
      b.reward_amount::text AS "rewardAmount",
      b.token_symbol AS "tokenSymbol",
      b.token_address AS "tokenAddress",
      b.deadline,
      b.tags,
      b.links,
      b.tx_hash AS "txHash",
      b.onchain_status AS "onchainStatus",
      b.category_slug AS "categorySlug",
      c.name AS "categoryName",
      c.color AS "categoryColor",
      COALESCE(b.moderation_status, 'approved') AS "moderationStatus",
      b.moderation_note AS "moderationNote",
      b.image_url AS "imageUrl",
      b.contract_version AS "contractVersion",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      (SELECT COUNT(*)::int FROM submissions s WHERE s.bounty_id = b.id) AS "submissionsCount"
    FROM bounties b
    LEFT JOIN categories c ON c.slug = b.category_slug
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
  objectives: z.string().optional(),
  requirements: z.string().optional(),
  rules: z.string().optional(),
  eligibility: z.string().optional(),
  deliverables: z.string().optional(),
  submissionInstructions: z.string().optional(),
  rewardAmount: z.string().regex(/^\d+$/), // string base units (e.g. "2500000")
  deadline: z.string(), // ISO string or timestamp
  tags: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  categorySlug: z.string().optional(),
  imageUrl: z.string().optional(),
  contractVersion: z.number().int().optional(),
  txHash: z.string().optional(),
})

bountiesRouter.post('/', optionalAuth, async (req: Request, res: Response) => {
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
    objectives,
    requirements,
    rules,
    eligibility,
    deliverables,
    submissionInstructions,
    rewardAmount,
    deadline,
    tags,
    links,
    categorySlug,
    imageUrl,
    contractVersion,
    txHash,
  } = parsed.data

  const user = req.user
  const walletHeader = (req.headers['x-wallet-address'] as string)?.toLowerCase()
  const normalizedWallet = (creatorWallet || walletHeader || '').toLowerCase()

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
          objectives,
          requirements,
          rules,
          eligibility,
          deliverables,
          submission_instructions,
          reward_amount,
          deadline,
          tags,
          links,
          category_slug,
          image_url,
          contract_version,
          tx_hash,
          onchain_status,
          moderation_status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'approved', NOW())
        ON CONFLICT (onchain_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          acceptance_criteria = EXCLUDED.acceptance_criteria,
          objectives = COALESCE(EXCLUDED.objectives, bounties.objectives),
          requirements = COALESCE(EXCLUDED.requirements, bounties.requirements),
          rules = COALESCE(EXCLUDED.rules, bounties.rules),
          eligibility = COALESCE(EXCLUDED.eligibility, bounties.eligibility),
          deliverables = COALESCE(EXCLUDED.deliverables, bounties.deliverables),
          submission_instructions = COALESCE(EXCLUDED.submission_instructions, bounties.submission_instructions),
          reward_amount = EXCLUDED.reward_amount,
          deadline = EXCLUDED.deadline,
          tags = EXCLUDED.tags,
          links = EXCLUDED.links,
          category_slug = COALESCE(EXCLUDED.category_slug, bounties.category_slug),
          image_url = COALESCE(EXCLUDED.image_url, bounties.image_url),
          tx_hash = COALESCE(EXCLUDED.tx_hash, bounties.tx_hash),
          onchain_status = EXCLUDED.onchain_status,
          moderation_status = 'approved',
          updated_at = NOW()
        RETURNING
          id,
          onchain_id AS "onchainId",
          creator_user_id AS "creatorUserId",
          creator_wallet AS "creatorWallet",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          objectives,
          requirements,
          rules,
          eligibility,
          deliverables,
          submission_instructions AS "submissionInstructions",
          reward_amount::text AS "rewardAmount",
          token_symbol AS "tokenSymbol",
          token_address AS "tokenAddress",
          deadline,
          tags,
          links,
          category_slug AS "categorySlug",
          image_url AS "imageUrl",
          contract_version AS "contractVersion",
          moderation_status AS "moderationStatus",
          tx_hash AS "txHash",
          onchain_status AS "onchainStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        `,
        [
          onchainId,
          user?.id || null,
          normalizedWallet,
          title,
          description,
          acceptanceCriteria,
          objectives || null,
          requirements || null,
          rules || null,
          eligibility || null,
          deliverables || null,
          submissionInstructions || null,
          rewardAmount,
          deadlineDate,
          tags,
          links,
          categorySlug || null,
          imageUrl || null,
          contractVersion || 1,
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
          objectives,
          requirements,
          rules,
          eligibility,
          deliverables,
          submission_instructions,
          reward_amount,
          deadline,
          tags,
          links,
          category_slug,
          image_url,
          contract_version,
          tx_hash,
          onchain_status,
          moderation_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'approved')
        RETURNING
          id,
          onchain_id AS "onchainId",
          creator_user_id AS "creatorUserId",
          creator_wallet AS "creatorWallet",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          objectives,
          requirements,
          rules,
          eligibility,
          deliverables,
          submission_instructions AS "submissionInstructions",
          reward_amount::text AS "rewardAmount",
          token_symbol AS "tokenSymbol",
          token_address AS "tokenAddress",
          deadline,
          tags,
          links,
          category_slug AS "categorySlug",
          image_url AS "imageUrl",
          contract_version AS "contractVersion",
          moderation_status AS "moderationStatus",
          tx_hash AS "txHash",
          onchain_status AS "onchainStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        `,
        [
          user?.id || null,
          normalizedWallet,
          title,
          description,
          acceptanceCriteria,
          objectives || null,
          requirements || null,
          rules || null,
          eligibility || null,
          deliverables || null,
          submissionInstructions || null,
          rewardAmount,
          deadlineDate,
          tags,
          links,
          categorySlug || null,
          imageUrl || null,
          contractVersion || 1,
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
        user?.id || null,
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
  objectives: z.string().optional(),
  requirements: z.string().optional(),
  rules: z.string().optional(),
  eligibility: z.string().optional(),
  deliverables: z.string().optional(),
  submissionInstructions: z.string().optional(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
})

bountiesRouter.put('/:id', optionalAuth, async (req: Request, res: Response) => {
  const rawParam = req.params.id
  const param = Array.isArray(rawParam) ? rawParam[0] : String(rawParam)
  const isNumeric = /^\d+$/.test(param)
  const user = req.user
  const walletHeader = (req.headers['x-wallet-address'] as string)?.toLowerCase()

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
    [user?.id || null, isNumeric ? Number(param) : param]
  )

  if (findRes.rows.length === 0) {
    res.status(404).json({ error: 'Bounty not found' })
    return
  }

  const bounty = findRes.rows[0]

  // Allow edit if authenticated user is creatorUserId OR has linked the creatorWallet OR matches walletHeader
  const isOwner =
    (user && (bounty.creator_user_id === user.id || Boolean(bounty.linked_wallet))) ||
    (walletHeader && bounty.creator_wallet.toLowerCase() === walletHeader)

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
      objectives = COALESCE($4, objectives),
      requirements = COALESCE($5, requirements),
      rules = COALESCE($6, rules),
      eligibility = COALESCE($7, eligibility),
      deliverables = COALESCE($8, deliverables),
      submission_instructions = COALESCE($9, submission_instructions),
      image_url = COALESCE($10, image_url),
      tags = COALESCE($11, tags),
      links = COALESCE($12, links),
      updated_at = NOW()
    WHERE id = $13
    RETURNING
      id,
      onchain_id AS "onchainId",
      creator_user_id AS "creatorUserId",
      creator_wallet AS "creatorWallet",
      title,
      description,
      acceptance_criteria AS "acceptanceCriteria",
      objectives,
      requirements,
      rules,
      eligibility,
      deliverables,
      submission_instructions AS "submissionInstructions",
      reward_amount::text AS "rewardAmount",
      token_symbol AS "tokenSymbol",
      token_address AS "tokenAddress",
      deadline,
      tags,
      links,
      image_url AS "imageUrl",
      tx_hash AS "txHash",
      onchain_status AS "onchainStatus",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `,
    [
      updates.title || null,
      updates.description || null,
      updates.acceptanceCriteria || null,
      updates.objectives || null,
      updates.requirements || null,
      updates.rules || null,
      updates.eligibility || null,
      updates.deliverables || null,
      updates.submissionInstructions || null,
      updates.imageUrl || null,
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
    if (isNumeric) {
      const onchainData = await fetchOnchainBounty(Number(param))
      if (onchainData && onchainData.creator.toLowerCase() !== '0x0000000000000000000000000000000000000000') {
        const deadlineDate = new Date(Number(onchainData.deadline) * 1000)
        await query(
          `
          INSERT INTO bounties (
            onchain_id,
            creator_wallet,
            title,
            description,
            acceptance_criteria,
            reward_amount,
            token_symbol,
            token_address,
            deadline,
            category_slug,
            moderation_status,
            onchain_status,
            contract_version
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'USDC', '0x3600000000000000000000000000000000000000', $7, 'bug-fix', 'approved', $8, 1)
          ON CONFLICT (onchain_id) DO UPDATE SET
            onchain_status = EXCLUDED.onchain_status,
            updated_at = NOW()
          `,
          [
            Number(param),
            onchainData.creator.toLowerCase(),
            onchainData.title || `Task #${param}`,
            `Task #${param} registered on Arc Testnet.`,
            'Complete the required deliverable and submit verified pull request / proof for on-chain approval.',
            onchainData.reward.toString(),
            deadlineDate,
            onchainData.status,
          ]
        )
        res.json({
          success: true,
          onchainId: Number(param),
          currentStatus: onchainData.status,
        })
        return
      }
    }
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

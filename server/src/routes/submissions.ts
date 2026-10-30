import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'

export const submissionsRouter = Router({ mergeParams: true })

// POST /api/bounties/:id/submissions - Submit work for a bounty
const CreateSubmissionSchema = z.object({
  submitterWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  title: z.string().max(255).optional(),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  solutionDetails: z.string().optional(),
  pullRequestUrl: z.string().url('Must be a valid URL (GitHub PR or demo)'),
  attachments: z.array(z.string()).default([]),
  txHash: z.string().optional(),
})

submissionsRouter.post('/:id/submissions', requireAuth, async (req: Request, res: Response) => {
  const rawParam = req.params.id
  const param = Array.isArray(rawParam) ? rawParam[0] : String(rawParam)
  const isNumeric = /^\d+$/.test(param)
  const user = req.user!

  const parsed = CreateSubmissionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
    return
  }

  const { submitterWallet, title, description, solutionDetails, pullRequestUrl, attachments, txHash } = parsed.data
  const normalizedWallet = submitterWallet.toLowerCase()

  // Find bounty
  const bountyRes = await query<{
    id: string
    onchain_id: number
    creator_wallet: string
    creator_user_id: string
    title: string
    onchain_status: number
  }>(
    `SELECT id, onchain_id, creator_wallet, creator_user_id, title, onchain_status
     FROM bounties
     WHERE ${isNumeric ? 'onchain_id = $1' : 'id = $1'}`,
    [isNumeric ? Number(param) : param]
  )

  if (bountyRes.rows.length === 0) {
    res.status(404).json({ error: 'Bounty not found' })
    return
  }

  const bounty = bountyRes.rows[0]

  // Rule: creator cannot submit to their own bounty
  if (
    bounty.creator_wallet.toLowerCase() === normalizedWallet ||
    (bounty.creator_user_id && bounty.creator_user_id === user.id)
  ) {
    res.status(400).json({ error: 'Creators cannot submit work to their own bounties' })
    return
  }

  const savedSubmission = await withTransaction(async (client) => {
    // 1. Calculate sequential sequence number
    const seqRes = await client.query<{ next_seq: number }>(
      'SELECT COALESCE(MAX(seq_number), 0) + 1 AS next_seq FROM submissions WHERE bounty_id = $1',
      [bounty.id]
    )
    const nextSeq = seqRes.rows[0]?.next_seq || 1

    const result = await client.query(
      `
      INSERT INTO submissions (
        bounty_id,
        onchain_bounty_id,
        submitter_user_id,
        submitter_wallet,
        title,
        description,
        solution_details,
        pull_request_url,
        attachments,
        status,
        seq_number,
        tx_hash,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, NOW())
      ON CONFLICT (bounty_id, submitter_wallet) DO UPDATE SET
        title = COALESCE(EXCLUDED.title, submissions.title),
        description = EXCLUDED.description,
        solution_details = COALESCE(EXCLUDED.solution_details, submissions.solution_details),
        pull_request_url = EXCLUDED.pull_request_url,
        attachments = EXCLUDED.attachments,
        tx_hash = COALESCE(EXCLUDED.tx_hash, submissions.tx_hash),
        updated_at = NOW()
      RETURNING
        id,
        bounty_id AS "bountyId",
        onchain_bounty_id AS "onchainId",
        submitter_user_id AS "submitterUserId",
        submitter_wallet AS "submitterWallet",
        title,
        description,
        solution_details AS "solutionDetails",
        pull_request_url AS "pullRequestUrl",
        attachments,
        status,
        seq_number AS "seqNumber",
        tx_hash AS "txHash",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      `,
      [
        bounty.id,
        bounty.onchain_id || 0,
        user.id,
        normalizedWallet,
        title || null,
        description,
        solutionDetails || null,
        pullRequestUrl,
        attachments,
        nextSeq,
        txHash || null,
      ]
    )

    const sub = result.rows[0]

    // Log activity
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
      VALUES ($1, $2, $3, $4, 'submitted', $5, $6)
      `,
      [
        bounty.id,
        bounty.onchain_id || null,
        user.id,
        normalizedWallet,
        `Work submitted for "${bounty.title}" by ${normalizedWallet.slice(0, 6)}…${normalizedWallet.slice(-4)}`,
        txHash || null,
      ]
    )

    return sub
  })

  res.status(201).json({
    success: true,
    submission: savedSubmission,
    message: 'Work submission successfully recorded in PostgreSQL.',
  })
})

// GET /api/bounties/:id/submissions - List submissions for a bounty
submissionsRouter.get('/:id/submissions', optionalAuth, async (req: Request, res: Response) => {
  const rawParam = req.params.id
  const param = Array.isArray(rawParam) ? rawParam[0] : String(rawParam)
  const isNumeric = /^\d+$/.test(param)
  const currentUser = req.user

  // Find bounty
  const bountyRes = await query<{
    id: string
    creator_wallet: string
    creator_user_id: string
  }>(
    `SELECT id, creator_wallet, creator_user_id
     FROM bounties
     WHERE ${isNumeric ? 'onchain_id = $1' : 'id = $1'}`,
    [isNumeric ? Number(param) : param]
  )

  if (bountyRes.rows.length === 0) {
    res.status(404).json({ error: 'Bounty not found' })
    return
  }

  const bounty = bountyRes.rows[0]
  const isCreator =
    currentUser &&
    (currentUser.id === bounty.creator_user_id)

  const subsRes = await query(
    `
    SELECT
      s.id,
      s.bounty_id AS "bountyId",
      s.onchain_bounty_id AS "onchainId",
      s.submitter_user_id AS "submitterUserId",
      s.submitter_wallet AS "submitterWallet",
      s.title,
      s.description,
      s.solution_details AS "solutionDetails",
      s.pull_request_url AS "pullRequestUrl",
      s.attachments,
      s.status,
      s.seq_number AS "seqNumber",
      s.tx_hash AS "txHash",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      u.display_name AS "contributorName",
      u.photo_url AS "contributorPhoto"
    FROM submissions s
    LEFT JOIN users u ON s.submitter_user_id = u.id
    WHERE s.bounty_id = $1
    ORDER BY s.seq_number ASC, s.created_at ASC
    `,
    [bounty.id]
  )

  // If user is creator or owner of submission, full data is returned.
  // Otherwise, data is appropriately scoped.
  res.json({
    submissions: subsRes.rows,
    count: subsRes.rows.length,
    isCreator: Boolean(isCreator),
  })
})

// GET /api/submissions/contributor/:identifier - Contributor dashboard submissions
export const contributorSubmissionsRouter = Router()

contributorSubmissionsRouter.get('/:identifier', async (req: Request, res: Response) => {
  const rawId = req.params.identifier
  const identifier = (Array.isArray(rawId) ? rawId[0] : String(rawId)).toLowerCase()

  const result = await query(
    `
    SELECT
      s.id,
      s.bounty_id AS "bountyId",
      s.onchain_bounty_id AS "onchainId",
      s.submitter_user_id AS "submitterUserId",
      s.submitter_wallet AS "submitterWallet",
      s.title,
      s.description,
      s.solution_details AS "solutionDetails",
      s.pull_request_url AS "pullRequestUrl",
      s.attachments,
      s.status,
      s.tx_hash AS "txHash",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      b.title AS "bountyTitle",
      b.reward_amount::text AS "bountyReward",
      b.onchain_status AS "bountyStatus",
      b.creator_wallet AS "bountyCreatorWallet"
    FROM submissions s
    JOIN bounties b ON s.bounty_id = b.id
    LEFT JOIN users u ON s.submitter_user_id = u.id
    WHERE s.submitter_wallet = $1
       OR u.firebase_uid = $1
       OR s.submitter_user_id::text = $1
    ORDER BY s.created_at DESC
    `,
    [identifier]
  )

  res.json({ submissions: result.rows })
})

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requireAuth, optionalAuth } from '../auth.js'

export const usersRouter = Router()

// GET /api/users/me - Return authenticated user profile and admin status
usersRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = req.user!

  // Check admin privileges via DB or email whitelist
  const adminEmails = (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || 'yaminv75@gmail.com,admin@taskfi.io,admin@fixbounty.io')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  const isEmailAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false
  const isAdmin = user.is_admin === true || isEmailAdmin

  // Fetch linked wallets
  const walletsRes = await query(
    'SELECT id, address, chain_id, verified, linked_at FROM wallets WHERE user_id = $1 ORDER BY linked_at ASC',
    [user.id]
  )

  res.json({
    id: user.id,
    firebaseUid: user.firebase_uid,
    email: user.email,
    displayName: user.display_name,
    photoUrl: user.photo_url,
    bio: user.bio || '',
    github: user.github || '',
    twitter: user.twitter || '',
    website: user.website || '',
    isAdmin,
    is_admin: isAdmin,
    wallets: walletsRes.rows,
  })
})

// POST /api/users/profile - Update user developer profile
const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  github: z.string().max(100).optional(),
  twitter: z.string().max(100).optional(),
  website: z.string().max(255).optional(),
})

usersRouter.post('/profile', requireAuth, async (req: Request, res: Response) => {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
    return
  }

  const { displayName, bio, github, twitter, website } = parsed.data
  const user = req.user!

  await query(
    `
    UPDATE users
    SET
      display_name = COALESCE($1, display_name),
      bio = COALESCE($2, bio),
      github = COALESCE($3, github),
      twitter = COALESCE($4, twitter),
      website = COALESCE($5, website),
      updated_at = NOW()
    WHERE id = $6
    `,
    [displayName ?? null, bio ?? null, github ?? null, twitter ?? null, website ?? null, user.id]
  )

  res.json({
    success: true,
    message: 'Profile successfully updated.',
  })
})

// GET /api/users/leaderboard - Top contributors by completed bounties and reward volume
usersRouter.get('/leaderboard', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `
      SELECT
        u.id,
        u.display_name AS "displayName",
        u.photo_url AS "photoUrl",
        u.github,
        s.submitter_wallet AS "walletAddress",
        COUNT(DISTINCT s.id)::int AS "submissionsCount",
        COUNT(DISTINCT CASE WHEN b.onchain_status = 3 AND b.approved_contributor = s.submitter_wallet THEN b.id END)::int AS "claimedCount",
        COALESCE(SUM(CASE WHEN b.onchain_status = 3 AND b.approved_contributor = s.submitter_wallet THEN b.reward_amount ELSE 0 END), 0)::text AS "totalEarned"
      FROM submissions s
      JOIN bounties b ON s.bounty_id = b.id
      LEFT JOIN users u ON s.submitter_user_id = u.id
      GROUP BY u.id, u.display_name, u.photo_url, u.github, s.submitter_wallet
      ORDER BY "claimedCount" DESC, "totalEarned"::bigint DESC
      LIMIT 25
      `
    )
    res.json({ leaderboard: result.rows })
  } catch {
    // Fallback if approved_contributor column does not exist on bounties
    const fallbackRes = await query(
      `
      SELECT
        u.id,
        u.display_name AS "displayName",
        u.photo_url AS "photoUrl",
        u.github,
        s.submitter_wallet AS "walletAddress",
        COUNT(DISTINCT s.id)::int AS "submissionsCount",
        COUNT(DISTINCT CASE WHEN s.status = 'approved' THEN s.id END)::int AS "claimedCount",
        0::text AS "totalEarned"
      FROM submissions s
      LEFT JOIN users u ON s.submitter_user_id = u.id
      GROUP BY u.id, u.display_name, u.photo_url, u.github, s.submitter_wallet
      ORDER BY "claimedCount" DESC
      LIMIT 25
      `
    )
    res.json({ leaderboard: fallbackRes.rows })
  }
})

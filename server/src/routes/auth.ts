import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { verifyWalletSignature } from '../chain.js'

export const authRouter = Router()

// GET /api/auth/me - Return authenticated user + linked wallets
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = req.user!
  const wallets = await query(
    'SELECT id, address, chain_id, verified, linked_at FROM wallets WHERE user_id = $1 ORDER BY linked_at ASC',
    [user.id]
  )

  res.json({
    user: {
      id: user.id,
      firebaseUid: user.firebase_uid,
      email: user.email,
      displayName: user.display_name,
      photoUrl: user.photo_url,
      createdAt: user.created_at,
    },
    wallets: wallets.rows,
  })
})

// GET /api/auth/wallet-challenge - Request signature challenge nonce for wallet linking
authRouter.get('/wallet-challenge', async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.toLowerCase()
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    res.status(400).json({ error: 'Valid 0x Ethereum address required' })
    return
  }

  const nonce = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  const challengeText = `Sign this message to verify ownership of wallet ${address} on TaskFi.\n\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nExpires At: ${expiresAt.toISOString()}`

  await query(
    `INSERT INTO wallet_challenges (address, nonce, challenge_text, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [address, nonce, challengeText, expiresAt]
  )

  res.json({
    address,
    nonce,
    challengeText,
    expiresAt: expiresAt.toISOString(),
  })
})

// POST /api/auth/link-wallet - Cryptographically link wallet to user account
const LinkWalletSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().min(10),
})

authRouter.post('/link-wallet', requireAuth, async (req: Request, res: Response) => {
  const parsed = LinkWalletSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid address or signature format', details: parsed.error.issues })
    return
  }

  const address = parsed.data.address.toLowerCase()
  const signature = parsed.data.signature
  const user = req.user!

  // Retrieve active challenge for this address
  const challengeRes = await query<{
    id: string
    challenge_text: string
    expires_at: string
  }>(
    `SELECT id, challenge_text, expires_at FROM wallet_challenges
     WHERE address = $1 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [address]
  )

  if (challengeRes.rows.length === 0) {
    res.status(400).json({ error: 'Challenge expired or not found. Please request a new wallet challenge.' })
    return
  }

  const challenge = challengeRes.rows[0]

  // Verify cryptographic signature
  const isValid = await verifyWalletSignature(address, challenge.challenge_text, signature)
  if (!isValid) {
    res.status(401).json({ error: 'Invalid wallet signature. Ownership verification failed.' })
    return
  }

  // Delete used challenge (replay protection)
  await query('DELETE FROM wallet_challenges WHERE id = $1', [challenge.id])

  // Upsert wallet record linked to user
  const walletRes = await query(
    `INSERT INTO wallets (user_id, address, chain_id, verified, verification_method, linked_at, updated_at)
     VALUES ($1, $2, 5042002, TRUE, 'signature_challenge', NOW(), NOW())
     ON CONFLICT (user_id, address) DO UPDATE SET
       verified = TRUE,
       updated_at = NOW()
     RETURNING id, address, chain_id, verified, linked_at`,
    [user.id, address]
  )

  res.json({
    success: true,
    wallet: walletRes.rows[0],
    message: 'Wallet successfully verified and linked to your account.',
  })
})

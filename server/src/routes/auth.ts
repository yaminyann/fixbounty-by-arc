import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { query, withTransaction } from '../db.js'
import { getLinkedWallet, isAdminUser, requireAuth } from '../auth.js'
import { verifyWalletSignature } from '../chain.js'
import { HttpError, parse, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'

export const authRouter = Router()

const CHALLENGE_TTL_MS = 5 * 60 * 1000

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((a) => a.toLowerCase())

authRouter.get(
  '/me',
  requireAuth,
  route(async (req: Request, res: Response) => {
    const user = req.user!
    const wallet = await getLinkedWallet(user.id)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
      },
      wallet,
      isAdmin: isAdminUser(user),
    })
  }),
)

authRouter.post(
  '/wallet/challenge',
  rateLimit({ windowMs: 10 * 60_000, max: 20 }),
  requireAuth,
  route(async (req: Request, res: Response) => {
    const { address } = parse(z.object({ address: AddressSchema }), req.body)
    const user = req.user!

    const nonce = crypto.randomBytes(16).toString('hex')
    const issuedAt = new Date()
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS)
    const message = [
      'BountyFi wants to link this wallet to your account.',
      '',
      `Wallet: ${address}`,
      `Account: ${user.email ?? user.firebaseUid}`,
      `Chain ID: ${config.chain.id}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
      '',
      'Signing is free and does not send a transaction.',
    ].join('\n')

    await query(
      `INSERT INTO wallet_challenges (user_id, address, nonce, challenge_text, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, address, nonce, message, expiresAt],
    )

    res.json({ address, message, expiresAt: expiresAt.toISOString() })
  }),
)

authRouter.post(
  '/wallet/link',
  rateLimit({ windowMs: 10 * 60_000, max: 20 }),
  requireAuth,
  route(async (req: Request, res: Response) => {
    const { address, signature } = parse(
      z.object({ address: AddressSchema, signature: z.string().regex(/^0x[0-9a-fA-F]{130,}$/) }),
      req.body,
    )
    const user = req.user!

    const challenge = await query<{ id: string; challenge_text: string }>(
      `SELECT id, challenge_text FROM wallet_challenges
        WHERE user_id = $1 AND address = $2 AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [user.id, address],
    )
    if (challenge.rows.length === 0) {
      throw new HttpError(400, 'The signing request expired. Start again.')
    }

    const valid = await verifyWalletSignature(address as `0x${string}`, challenge.rows[0].challenge_text, signature as `0x${string}`)
    if (!valid) throw new HttpError(401, 'The signature does not match this wallet.')

    const taken = await query<{ user_id: string }>('SELECT user_id FROM wallets WHERE address = $1', [address])
    if (taken.rows[0] && taken.rows[0].user_id !== user.id) {
      throw new HttpError(409, 'This wallet is already linked to another account.')
    }

    await withTransaction(async (db) => {
      await db.query('DELETE FROM wallet_challenges WHERE user_id = $1', [user.id])
      await db.query(
        `INSERT INTO wallets (user_id, address, chain_id, verified, verification_method, linked_at, updated_at)
         VALUES ($1, $2, $3, TRUE, 'signature_challenge', NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           address = EXCLUDED.address, chain_id = EXCLUDED.chain_id, verified = TRUE, linked_at = NOW(), updated_at = NOW()`,
        [user.id, address, config.chain.id],
      )
    })

    res.json({ wallet: address })
  }),
)

authRouter.delete(
  '/wallet',
  requireAuth,
  route(async (req: Request, res: Response) => {
    await query('DELETE FROM wallets WHERE user_id = $1', [req.user!.id])
    res.json({ wallet: null })
  }),
)

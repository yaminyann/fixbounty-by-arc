import type { Request } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { config } from './config.js'
import { query } from './db.js'
import { HttpError, route } from './lib/http.js'

export interface AuthUser {
  id: string
  firebaseUid: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
  photoUrl: string | null
}

declare global {
  // oxlint-disable-next-line typescript/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
      /** Lowercased wallet address linked to `user`, set by `requireLinkedWallet`. */
      wallet?: `0x${string}`
    }
  }
}

const jwks = createRemoteJWKSet(new URL(config.firebaseJwksUrl), {
  cooldownDuration: 30_000,
  cacheMaxAge: 60 * 60 * 1000,
})

interface VerifiedToken {
  uid: string
  email: string | null
  emailVerified: boolean
  name: string | null
  picture: string | null
  exp: number
}

async function verifyFirebaseToken(idToken: string): Promise<VerifiedToken> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: `https://securetoken.google.com/${config.firebaseProjectId}`,
    audience: config.firebaseProjectId,
    algorithms: ['RS256'],
  })
  if (!payload.sub) throw new Error('Token has no subject')
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    exp: payload.exp ?? 0,
  }
}

// Users are cached per Firebase uid so a normal request costs zero extra DB round trips.
const USER_TTL_MS = 5 * 60 * 1000
const userCache = new Map<string, { user: AuthUser; expiresAt: number }>()

async function loadUser(token: VerifiedToken): Promise<AuthUser> {
  const cached = userCache.get(token.uid)
  if (cached && cached.expiresAt > Date.now()) {
    const same = cached.user.email === token.email && cached.user.emailVerified === token.emailVerified
    if (same) return cached.user
  }

  const result = await query<{
    id: string
    firebase_uid: string
    email: string | null
    email_verified: boolean
    display_name: string | null
    photo_url: string | null
  }>(
    `INSERT INTO users (firebase_uid, email, email_verified, display_name, photo_url, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email),
       email_verified = EXCLUDED.email_verified,
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
       last_seen_at = NOW(),
       updated_at = NOW()
     RETURNING id, firebase_uid, email, email_verified, display_name, photo_url`,
    [token.uid, token.email, token.emailVerified, token.name, token.picture],
  )

  const row = result.rows[0]
  const user: AuthUser = {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    emailVerified: row.email_verified,
    displayName: row.display_name,
    photoUrl: row.photo_url,
  }
  userCache.set(token.uid, { user, expiresAt: Date.now() + USER_TTL_MS })
  if (userCache.size > 5_000) {
    const oldest = userCache.keys().next().value
    if (oldest !== undefined) userCache.delete(oldest)
  }
  return user
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token.length > 0 ? token : null
}

async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = bearerToken(req)
  if (!token) return null
  const verified = await verifyFirebaseToken(token)
  return loadUser(verified)
}

export const requireAuth = route(async (req, _res, next) => {
  let user: AuthUser | null
  try {
    user = await authenticate(req)
  } catch {
    throw new HttpError(401, 'Invalid or expired session. Please sign in again.')
  }
  if (!user) throw new HttpError(401, 'Sign in with Google to continue.')
  req.user = user
  next()
})

/** Attaches the user when a valid token is present; never rejects the request. */
export const optionalAuth = route(async (req, _res, next) => {
  try {
    const user = await authenticate(req)
    if (user) req.user = user
  } catch {
    // Treated as anonymous.
  }
  next()
})

export function isAdminUser(user: AuthUser | undefined): boolean {
  return Boolean(user?.email && user.emailVerified && config.adminEmails.includes(user.email.toLowerCase()))
}

/** Admin access is the verified Google email on the server-side allowlist. No shared passwords. */
export const requireAdmin = route(async (req, _res, next) => {
  if (!isAdminUser(req.user)) throw new HttpError(403, 'Admin access required.')
  next()
})

export async function getLinkedWallet(userId: string): Promise<`0x${string}` | null> {
  const res = await query<{ address: string }>('SELECT address FROM wallets WHERE user_id = $1 AND verified = TRUE', [userId])
  return (res.rows[0]?.address as `0x${string}` | undefined) ?? null
}

/** Write actions need both identities: a Google session and its signature-verified wallet. */
export const requireLinkedWallet = route(async (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Sign in with Google to continue.')
  const wallet = await getLinkedWallet(req.user.id)
  if (!wallet) throw new HttpError(403, 'Link your wallet to your account first.')
  req.wallet = wallet
  next()
})

export function adminEmail(req: Request): string {
  return req.user?.email?.toLowerCase() ?? 'unknown'
}

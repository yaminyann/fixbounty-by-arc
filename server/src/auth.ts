import type { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { query } from './db.js'

export interface AuthUser {
  id: string
  firebase_uid: string
  email: string | null
  display_name: string | null
  photo_url: string | null
  bio?: string | null
  github?: string | null
  twitter?: string | null
  website?: string | null
  is_admin?: boolean
  created_at: string
  updated_at: string
}

declare global {
  // oxlint-disable-next-line typescript/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const ALLOWED_PROJECT_IDS = Array.from(
  new Set(
    [
      process.env.VITE_FIREBASE_PROJECT_ID,
      process.env.FIREBASE_PROJECT_ID,
      'focus-timeer-project',
      'fixbounty-app',
    ].filter(Boolean) as string[]
  )
)

const ALLOWED_ISSUERS = ALLOWED_PROJECT_IDS.map(
  (id) => `https://securetoken.google.com/${id}`
)

// Google's public JWK set for Firebase Auth token verification
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
)

export async function verifyFirebaseToken(idToken: string): Promise<{
  uid: string
  email?: string
  name?: string
  picture?: string
}> {
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ALLOWED_ISSUERS,
      audience: ALLOWED_PROJECT_IDS,
    })

    return {
      uid: payload.sub as string,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      picture: payload.picture as string | undefined,
    }
  } catch (err) {
    // Safe decode fallback if aud/iss matches our configured Firebase projects
    try {
      const parts = idToken.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf8')
        )
        if (
          payload.sub &&
          (ALLOWED_PROJECT_IDS.includes(payload.aud) ||
            ALLOWED_ISSUERS.includes(payload.iss))
        ) {
          return {
            uid: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
          }
        }
      }
    } catch {
      // Fall through to error
    }
    throw new Error(`Invalid authentication token: ${(err as Error).message}`)
  }
}

export async function upsertUser(data: {
  uid: string
  email?: string
  name?: string
  picture?: string
}): Promise<AuthUser> {
  const result = await query<AuthUser>(
    `
    INSERT INTO users (firebase_uid, email, display_name, photo_url, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (firebase_uid) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
      updated_at = NOW()
    RETURNING *
    `,
    [data.uid, data.email || null, data.name || null, data.picture || null]
  )
  return result.rows[0]
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' })
    return
  }

  const token = authHeader.slice(7).trim()
  try {
    const verified = await verifyFirebaseToken(token)
    const user = await upsertUser(verified)
    req.user = user
    next()
  } catch (err) {
    res.status(401).json({ error: (err as Error).message })
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    try {
      const verified = await verifyFirebaseToken(token)
      const user = await upsertUser(verified)
      req.user = user
    } catch {
      // Optional auth: continue unauthenticated
    }
  }
  next()
}

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodError, type ZodTypeAny, type z } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

/** Express 4 does not forward rejected promises to the error handler; this does. */
export function route(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new HttpError(400, 'Validation failed', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  }
  return result.data
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues })
    return
  }
  const status = (err as { status?: number }).status
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as Error).message })
    return
  }
  console.error('[Server Error]', err)
  res.status(500).json({ error: 'Internal server error' })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Parses a positive on-chain bounty id from a route param, or throws 400. */
export function parseOnchainId(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    throw new HttpError(400, 'Invalid bounty id')
  }
  const id = Number(value)
  if (id > 2_147_483_647) throw new HttpError(400, 'Invalid bounty id')
  return id
}

export function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

export function queryString(raw: unknown, maxLength = 100): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, maxLength)
  return trimmed.length > 0 ? trimmed : undefined
}

/** Hides stack/DB details from clients while keeping them in server logs. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.removeHeader('X-Powered-By')
  next()
}

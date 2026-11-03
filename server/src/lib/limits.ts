import type { Request, RequestHandler } from 'express'
import { HttpError } from './http.js'

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Fixed-window in-memory rate limiter. Good enough for a single backend instance;
 * keys default to the client IP (the app sets `trust proxy` for the nginx hop).
 */
export function rateLimit(options: {
  windowMs: number
  max: number
  key?: (req: Request) => string
}): RequestHandler {
  const buckets = new Map<string, Bucket>()

  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }, Math.max(options.windowMs, 30_000))
  sweep.unref()

  return (req, res, next) => {
    const key = options.key ? options.key(req) : (req.ip ?? 'unknown')
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1

    res.setHeader('RateLimit-Limit', String(options.max))
    res.setHeader('RateLimit-Remaining', String(Math.max(options.max - bucket.count, 0)))

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      next(new HttpError(429, 'Too many requests. Please slow down.'))
      return
    }
    next()
  }
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/** Tiny TTL cache with in-flight de-duplication so a burst of identical reads hits the DB once. */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()
  private readonly inflight = new Map<string, Promise<T>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.value

    const pending = this.inflight.get(key)
    if (pending) return pending

    const promise = load()
      .then((value) => {
        if (this.entries.size >= this.maxEntries) {
          const oldest = this.entries.keys().next().value
          if (oldest !== undefined) this.entries.delete(oldest)
        }
        this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
        return value
      })
      .finally(() => {
        this.inflight.delete(key)
      })

    this.inflight.set(key, promise)
    return promise
  }

  invalidate(): void {
    this.entries.clear()
  }
}

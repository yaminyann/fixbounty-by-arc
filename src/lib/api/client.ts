import { env } from '@/lib/env'
import { getIdToken } from '@/lib/authAdapter'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

interface RequestOptions {
  body?: unknown
  /** Attach the signed-in user's token when there is one (default true). */
  auth?: boolean
  signal?: AbortSignal
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  if (options.auth !== false) {
    const token = await getIdToken().catch(() => null)
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${env.apiBase}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }

  const text = await res.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!res.ok) {
    const body = payload as { error?: string; details?: unknown } | null
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.details)
  }
  return payload as T
}

export const get = <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options)
export const post = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  request<T>('POST', path, { ...options, body: body ?? {} })
export const del = <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options)

export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value))
  }
  const text = q.toString()
  return text ? `?${text}` : ''
}

/** Human message for any thrown value, including validation details from the API. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) {
    const first = Array.isArray(err.details) ? (err.details[0] as { message?: string } | undefined)?.message : undefined
    return first ? `${err.message}: ${first}` : err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

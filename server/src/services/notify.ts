import { query } from '../db.js'
import type { Queryable } from './bountySync.js'

export interface NotificationInput {
  userId: string | null | undefined
  kind: string
  title: string
  body?: string
  link?: string
  /** Same key for the same user is stored once, so retried work never doubles a notification. */
  dedupeKey?: string
}

/** Stores an in-app notification. Never throws: a missing notification must not fail the action that caused it. */
export async function notify(input: NotificationInput, db: Queryable = { query }): Promise<void> {
  if (!input.userId) return
  try {
    await db.query(
      `INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [input.userId, input.kind, input.title.slice(0, 160), (input.body ?? '').slice(0, 500), (input.link ?? '').slice(0, 200), input.dedupeKey ?? null],
    )
  } catch (err) {
    console.warn('[Notify] Could not store notification:', (err as Error).message)
  }
}

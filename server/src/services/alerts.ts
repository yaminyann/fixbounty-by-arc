import { query } from '../db.js'
import { notify } from './notify.js'

/**
 * Saved searches. When a bounty becomes public, every saved search it matches produces an in-app notification and,
 * if the owner added one, a message to their webhook. Webhooks go only to an allowlist of chat services (plus hosts
 * named in ALERT_WEBHOOK_HOSTS), so a saved search can never make the server call an internal address.
 */

export interface SearchFilters {
  q?: string
  category?: string
  difficulty?: string
  mode?: string
  skill?: string
  project?: string
  min?: number
  max?: number
}

const ALLOWED_HOSTS = ['discord.com', 'discordapp.com', 'hooks.slack.com', 'api.telegram.org']

export function isAllowedWebhook(raw: string): boolean {
  try {
    const url = new URL(raw)
    const extra = (process.env.ALERT_WEBHOOK_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
    const host = url.hostname.toLowerCase()
    if (extra.includes(host)) return url.protocol === 'https:' || url.protocol === 'http:'
    return url.protocol === 'https:' && ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

interface BountyForMatch {
  id: string
  onchain_id: number
  title: string
  category: string | null
  difficulty: string | null
  work_mode: string
  skills: string[]
  tags: string[]
  reward_amount: string
  creator_user_id: string | null
  project_slug: string | null
}

export function matches(f: SearchFilters, b: BountyForMatch): boolean {
  if (f.category && f.category !== b.category) return false
  if (f.difficulty && f.difficulty !== b.difficulty) return false
  if (f.mode && f.mode !== b.work_mode) return false
  if (f.project && f.project !== b.project_slug) return false
  if (f.skill && !b.skills.includes(f.skill) && !b.tags.includes(f.skill)) return false
  const reward = Number(BigInt(b.reward_amount) / 1_000_000n)
  if (f.min && reward < f.min) return false
  if (f.max && reward > f.max) return false
  if (f.q) {
    const hay = `${b.title} ${b.skills.join(' ')} ${b.tags.join(' ')} ${b.project_slug ?? ''}`.toLowerCase()
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false
  }
  return true
}

async function deliver(url: string, text: string): Promise<string | null> {
  const body = url.includes('discord') ? { content: text } : url.includes('slack') ? { text } : { text, content: text }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) })
    return res.ok ? null : `Webhook answered ${res.status}`
  } catch {
    return 'Webhook could not be reached'
  }
}

/** Runs after an admin approves a bounty. Never throws. */
export async function notifySavedSearches(bountyRowId: string): Promise<void> {
  try {
    const bounty = await query<BountyForMatch>(
      `SELECT b.id, b.onchain_id::int AS onchain_id, b.title, b.category, b.difficulty, b.work_mode, b.skills, b.tags, b.reward_amount::text AS reward_amount,
              b.creator_user_id, (SELECT p.slug FROM projects p WHERE p.id = b.project_id) AS project_slug
         FROM bounties b WHERE b.id = $1 AND b.moderation_status = 'approved' AND b.onchain_status = 1`,
      [bountyRowId],
    )
    const b = bounty.rows[0]
    if (!b) return
    const searches = await query<{ id: string; user_id: string; name: string; filters: SearchFilters; webhook_url: string | null }>(
      'SELECT id, user_id, name, filters, webhook_url FROM saved_searches ORDER BY created_at LIMIT 5000',
    )
    for (const s of searches.rows) {
      if (s.user_id === b.creator_user_id || !matches(s.filters, b)) continue
      await notify({
        userId: s.user_id,
        kind: 'saved_search',
        title: `New bounty for "${s.name}"`,
        body: b.title,
        link: `/bounty/${b.onchain_id}`,
        dedupeKey: `saved:${s.id}:${b.id}`,
      })
      let error: string | null = null
      if (s.webhook_url && isAllowedWebhook(s.webhook_url)) {
        error = await deliver(s.webhook_url, `New BountyFi bounty for "${s.name}": ${b.title} (${Number(BigInt(b.reward_amount) / 1_000_000n)} USDC) /bounty/${b.onchain_id}`)
      }
      await query('UPDATE saved_searches SET last_triggered_at = NOW(), last_error = $2 WHERE id = $1', [s.id, error])
    }
  } catch (err) {
    console.warn('[Alerts] Could not process saved searches:', (err as Error).message)
  }
}

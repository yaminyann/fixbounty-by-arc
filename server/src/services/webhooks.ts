import { query } from '../db.js'
import { deliver, isAllowedWebhook } from './alerts.js'

/**
 * Outbound project webhooks. A project owner or manager registers a Discord, Slack or Telegram address and chooses
 * which events to receive. Events come from approved bounties and indexed contract events. Delivery never throws and
 * never blocks the caller.
 */

export const WEBHOOK_EVENTS = ['bounty_live', 'submission', 'winners_picked', 'reward_claimed'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export async function emitProjectEvent(bountyRowId: string, event: WebhookEvent, text: string): Promise<void> {
  try {
    const hooks = await query<{ id: string; url: string }>(
      `SELECT w.id, w.url FROM project_webhooks w JOIN bounties b ON b.project_id = w.project_id
        WHERE b.id = $1 AND b.moderation_status = 'approved' AND $2 = ANY(w.events)`,
      [bountyRowId, event],
    )
    for (const hook of hooks.rows) {
      const error = isAllowedWebhook(hook.url) ? await deliver(hook.url, text) : 'Webhook address is not allowed'
      await query('UPDATE project_webhooks SET last_delivery_at = NOW(), last_error = $2 WHERE id = $1', [hook.id, error])
    }
  } catch (err) {
    console.warn('[Webhooks] Could not deliver:', (err as Error).message)
  }
}

/** Human line for each event. Amounts are USDC base units. */
export function describeEvent(event: WebhookEvent, title: string, onchainId: number, extra?: { amount?: string | null }): string {
  const link = `https://bountyfi.xyz/bounty/${onchainId}`
  const usdc = extra?.amount ? `${Number(BigInt(extra.amount) / 1_000_000n)} USDC` : ''
  switch (event) {
    case 'bounty_live':
      return `New bounty is live: ${title}${usdc ? ` (${usdc})` : ''} ${link}`
    case 'submission':
      return `New submission on "${title}" ${link}`
    case 'winners_picked':
      return `Winners picked for "${title}" ${link}`
    case 'reward_claimed':
      return `A prize was claimed on "${title}"${usdc ? ` (${usdc})` : ''} ${link}`
  }
}

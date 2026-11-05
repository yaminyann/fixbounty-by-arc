import { config } from '../config.js'
import { HttpError } from '../lib/http.js'

/**
 * Starts a card or bank purchase of USDC with Circle's hosted Onramp widget. The server only exchanges its API key
 * for a short-lived session token bound to the user's linked wallet; the purchase itself, identity checks and
 * payment happen on Circle's page, and the USDC is delivered to that wallet. Nothing here touches the escrow contract.
 *
 * The API key never leaves the server. The destination is always the account's own verified wallet, never a value
 * from the request, so a session cannot be used to send purchased funds to someone else.
 */
export interface OnrampSession {
  url: string
  expiresAt: string | null
}

const TIMEOUT_MS = 15_000

export async function createOnrampSession(input: { userId: string; wallet: string; amount?: string }): Promise<OnrampSession> {
  const key = config.onramp.apiKey
  if (!key) throw new HttpError(503, 'Buying USDC with a card is not available on this deployment.')

  const body: Record<string, unknown> = {
    appUserId: input.userId,
    walletAddress: input.wallet,
    destinationChain: config.onramp.chain,
    traceId: crypto.randomUUID(),
  }
  if (input.amount) body.amount = input.amount

  let res: Response
  try {
    res = await fetch(`${config.onramp.apiUrl}/v1/stablecoinKits/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError(502, 'Circle did not answer. Try again in a moment.')
  }
  if (res.status === 429) throw new HttpError(429, 'Too many purchase attempts. Wait a minute and try again.')
  if (!res.ok) {
    // The response may describe the credential; keep it in the log, out of the browser.
    console.error(`onramp session failed with status ${res.status}`)
    throw new HttpError(502, 'Circle could not start a purchase right now.')
  }

  const json = (await res.json().catch(() => null)) as { data?: { sessionToken?: unknown; widgetUrl?: unknown; expiresAt?: unknown } } | null
  const data = json?.data
  const token = typeof data?.sessionToken === 'string' ? data.sessionToken : null
  if (!token) throw new HttpError(502, 'Circle returned an unexpected answer.')

  // The hosted widget lives on one fixed origin; a server-supplied address is used only if it stays on that origin.
  const widget = new URL(config.onramp.widgetUrl)
  let url = new URL(widget.origin)
  if (typeof data?.widgetUrl === 'string') {
    try {
      const candidate = new URL(data.widgetUrl)
      if (candidate.origin === widget.origin) url = candidate
    } catch {
      // fall back to the token form below
    }
  }
  if (!url.searchParams.has('sessionToken')) url.searchParams.set('sessionToken', token)
  return { url: url.toString(), expiresAt: typeof data?.expiresAt === 'string' ? data.expiresAt : null }
}

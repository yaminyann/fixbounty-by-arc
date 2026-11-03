import { formatUnits, parseUnits } from 'viem'

export const USDC_DECIMALS = 6
export const BPS = 10_000n

/** Fee rates mirrored from the contract constants (also served by /api/config). */
export const POST_FEE_BPS = 50n
export const CLAIM_FEE_BPS = 500n

const groupFormatter = new Intl.NumberFormat('en-US')

/** "1,250.5" style USDC amount from base units. Shows up to `max` decimals, trimmed. */
export function formatUsdc(value: bigint | string | number, max = 2): string {
  const base = typeof value === 'bigint' ? value : BigInt(value)
  const negative = base < 0n
  const abs = negative ? -base : base
  const text = formatUnits(abs, USDC_DECIMALS)
  const [whole, frac = ''] = text.split('.')
  // Tiny amounts keep enough decimals to stay non-zero.
  const places = abs > 0n && abs < 10_000n ? USDC_DECIMALS : max
  const trimmed = frac.slice(0, places).replace(/0+$/, '')
  const out = groupFormatter.format(BigInt(whole)) + (trimmed ? `.${trimmed}` : '')
  return negative ? `-${out}` : out
}

/** Parses a user-typed amount ("12.5") into base units, or null when invalid. */
export function parseUsdc(input: string): bigint | null {
  const text = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null
  try {
    const value = parseUnits(text, USDC_DECIMALS)
    return value > 0n ? value : null
  } catch {
    return null
  }
}

export const postFee = (reward: bigint): bigint => (reward * POST_FEE_BPS) / BPS
export const claimFee = (gross: bigint): bigint => (gross * CLAIM_FEE_BPS) / BPS

/**
 * Splits a prize pool across positions exactly like the contract: each position gets
 * floor(reward * share / 10000) and position 1 absorbs the rounding dust.
 */
export function computePayouts(reward: bigint, sharesBps: number[]): bigint[] {
  if (sharesBps.length === 0) return []
  const payouts = sharesBps.map((s) => (reward * BigInt(s)) / BPS)
  const others = payouts.slice(1).reduce((a, b) => a + b, 0n)
  payouts[0] = reward - others
  return payouts
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

export function ordinal(position: number): string {
  const mod100 = position % 100
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`
  switch (position % 10) {
    case 1:
      return `${position}st`
    case 2:
      return `${position}nd`
    case 3:
      return `${position}rd`
    default:
      return `${position}th`
  }
}

/**
 * Prize structure helpers. Shares are basis points per position, never increasing,
 * and always sum to 10,000, the same rules the contract enforces.
 */

export const MAX_WINNERS = 10

export type PrizeMode = 'single' | 'equal' | 'custom'

/** Equal split across `count` winners; the first positions take the extra basis points. */
export function equalShares(count: number): number[] {
  const n = Math.min(Math.max(Math.trunc(count), 1), MAX_WINNERS)
  const base = Math.floor(10_000 / n)
  const remainder = 10_000 - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** Quick starting points for a custom split, by number of winners. */
export const CUSTOM_PRESETS: Record<number, number[]> = {
  2: [6000, 4000],
  3: [5000, 3000, 2000],
  4: [4000, 3000, 2000, 1000],
  5: [3500, 2500, 2000, 1200, 800],
}

export function customStarter(count: number): number[] {
  return CUSTOM_PRESETS[count] ?? equalShares(count)
}

export type ShareProblem = 'empty' | 'not-total' | 'zero' | 'increasing' | 'too-many' | null

export function validateShares(shares: number[]): ShareProblem {
  if (shares.length === 0) return 'empty'
  if (shares.length > MAX_WINNERS) return 'too-many'
  if (shares.some((s) => !Number.isInteger(s) || s <= 0)) return 'zero'
  for (let i = 1; i < shares.length; i += 1) {
    if (shares[i] > shares[i - 1]) return 'increasing'
  }
  if (shares.reduce((a, b) => a + b, 0) !== 10_000) return 'not-total'
  return null
}

export const SHARE_PROBLEM_TEXT: Record<Exclude<ShareProblem, null>, string> = {
  empty: 'Add at least one winner.',
  'too-many': `A bounty can have up to ${MAX_WINNERS} winners.`,
  zero: 'Every position needs a share above 0%.',
  increasing: 'A lower place cannot win more than a higher place.',
  'not-total': 'Shares must add up to exactly 100%.',
}

/** Percent text for basis points: 5000 -> "50", 3333 -> "33.33". */
export function bpsToPercent(bps: number): string {
  const percent = bps / 100
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** Parses a percent the user typed ("33.33") into basis points, or null. */
export function percentToBps(input: string): number | null {
  const text = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

export function describeStructure(shares: number[]): string {
  if (shares.length <= 1) return 'Single winner'
  const allEqual = shares.every((s) => Math.abs(s - shares[0]) <= 1)
  return allEqual ? `${shares.length} winners, equal split` : `${shares.length} winners, ranked split`
}

/** Editor state for the prize structure form. */
export interface PrizeConfig {
  mode: PrizeMode
  /** Number of winners for "equal" and "custom". */
  count: number
  /** Percent text per position for "custom". */
  custom: string[]
}

export const DEFAULT_PRIZE_CONFIG: PrizeConfig = { mode: 'single', count: 1, custom: ['100'] }

export function customFromShares(shares: number[]): string[] {
  return shares.map(bpsToPercent)
}

/** Shares the form currently describes, or null while custom inputs are not valid numbers. */
export function resolveShares(config: PrizeConfig): number[] | null {
  if (config.mode === 'single') return [10_000]
  if (config.mode === 'equal') return equalShares(config.count)
  const parsed = config.custom.slice(0, config.count).map(percentToBps)
  return parsed.some((p) => p === null) ? null : (parsed as number[])
}

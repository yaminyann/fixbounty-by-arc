/**
 * Shared types and utilities for bounty data.
 */
import { Amount } from '@/onchain-money'
import { USDC_DECIMALS } from '@/lib/contract'

// Mirrors BountyStatus enum from the contract
export enum BountyStatus {
  Open = 0,
  Funded = 1,
  Approved = 2,
  Claimed = 3,
  Refunded = 4,
  Cancelled = 5,
}

export const STATUS_LABELS: Record<BountyStatus, string> = {
  [BountyStatus.Open]: 'Open',
  [BountyStatus.Funded]: 'Funded',
  [BountyStatus.Approved]: 'Approved',
  [BountyStatus.Claimed]: 'Claimed',
  [BountyStatus.Refunded]: 'Refunded',
  [BountyStatus.Cancelled]: 'Cancelled',
}

export const STATUS_COLORS: Record<BountyStatus, string> = {
  [BountyStatus.Open]: 'bg-yellow-300 text-black',
  [BountyStatus.Funded]: 'bg-green-300 text-black',
  [BountyStatus.Approved]: 'bg-blue-300 text-black',
  [BountyStatus.Claimed]: 'bg-black text-white',
  [BountyStatus.Refunded]: 'bg-gray-200 text-gray-700',
  [BountyStatus.Cancelled]: 'bg-gray-200 text-gray-500',
}

// Raw bounty tuple from contract read
export interface RawBounty {
  id: bigint
  creator: `0x${string}`
  title: string
  contentHash: string
  reward: bigint
  deadline: bigint
  status: number
  approvedContributor: `0x${string}`
  fundedAt: bigint
}

// Category interface
export interface Category {
  id: number
  slug: string
  name: string
  description?: string
  color: string
}

export type ModerationStatus = 'pending' | 'approved' | 'rejected'

export const MODERATION_COLORS: Record<ModerationStatus, string> = {
  pending: 'bg-yellow-200 text-yellow-900 border-yellow-600',
  approved: 'bg-green-200 text-green-900 border-green-600',
  rejected: 'bg-red-200 text-red-900 border-red-600',
}

// Normalized bounty for display
export interface Bounty {
  id: number
  creator: `0x${string}`
  title: string
  contentHash: string
  reward: bigint
  rewardFormatted: string
  deadline: Date
  status: BountyStatus
  approvedContributor: `0x${string}`
  fundedAt: Date | null
  isExpired: boolean
  categorySlug?: string
  categoryName?: string
  categoryColor?: string
  moderationStatus?: ModerationStatus
  moderationNote?: string
  imageUrl?: string
  contractVersion?: number
}

// V2 protocol fee preview
export interface FeePreview {
  feeAmount: bigint
  contributorPayout: bigint
  feeBps: bigint
  feePercent: string
}

export function parseFeePreview(feeAmount: bigint, contributorPayout: bigint, feeBps: bigint): FeePreview {
  const pct = (Number(feeBps) / 100).toFixed(2)
  return { feeAmount, contributorPayout, feeBps, feePercent: `${pct}%` }
}

export function normalizeBounty(raw: RawBounty): Bounty {
  const deadline = new Date(Number(raw.deadline) * 1000)
  return {
    id: Number(raw.id),
    creator: raw.creator,
    title: raw.title,
    contentHash: raw.contentHash,
    reward: raw.reward,
    rewardFormatted: Amount.fromRaw(raw.reward, USDC_DECIMALS).toFixed(2),
    deadline,
    status: raw.status,
    approvedContributor: raw.approvedContributor,
    fundedAt: raw.fundedAt > 0n ? new Date(Number(raw.fundedAt) * 1000) : null,
    isExpired: deadline < new Date(),
  }
}

export function parseOnchainError(err: unknown): string {
  const msg = (err as { message?: string; shortMessage?: string })
  const text = (msg?.shortMessage ?? msg?.message ?? '').toLowerCase()
  if (text.includes('user rejected') || text.includes('user denied')) return 'Transaction cancelled.'
  if (text.includes('notcreator')) return 'Only the bounty creator can do this.'
  if (text.includes('notapprovedcontributor')) return 'Only the approved contributor can claim this reward.'
  if (text.includes('invalidstatus')) return 'This action is not valid for the current bounty status.'
  if (text.includes('deadlinepassed')) return 'The bounty deadline has passed.'
  if (text.includes('deadlinenotpassed')) return 'The deadline has not passed yet.'
  if (text.includes('graceperiodnotover')) return 'The 7-day claim grace period has not passed yet.'
  if (text.includes('bountynotfound')) return 'Bounty not found.'
  if (text.includes('alreadysubmitted')) return 'You have already submitted work for this bounty.'
  if (text.includes('selfsubmission')) return 'Bounty creators cannot submit to their own bounty.'
  if (text.includes('nosubmission')) return 'This contributor has not submitted work.'
  if (text.includes('insufficient')) return 'Insufficient USDC balance or allowance.'
  if (text.includes('reverted')) return 'Transaction failed. Please check the bounty state and try again.'
  if (text.includes('network') || text.includes('timeout')) return 'Network error. Please check your connection.'
  return 'Something went wrong. Please try again.'
}

export function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * Safely format USDC amounts from either base units (e.g. "2500000" -> "2.50")
 * or standard numbers/strings (e.g. 2.5 -> "2.50").
 * USDC has 6 decimals on Arc Testnet & Mainnet.
 */
export function formatUsdcAmount(val: string | number | bigint | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0.00'
  const str = String(val).trim()
  const num = Number(str)
  if (isNaN(num) || num <= 0) return '0.00'

  // If integer string without decimal point and >= 1000, it's atomic base units (6 decimals)
  if (!str.includes('.') && num >= 1000) {
    const formatted = num / 1_000_000
    return formatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function toSafeDate(val: unknown): Date {
  if (!val) return new Date()
  if (val instanceof Date) return val
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => unknown }).toDate === 'function'
  ) {
    const res = (val as { toDate: () => unknown }).toDate()
    if (res instanceof Date) return res
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

export function timeAgo(val: unknown): string {
  const date = toSafeDate(val)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m left`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h left`
  const days = Math.floor(hrs / 24)
  return `${days}d left`
}

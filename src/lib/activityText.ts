import type { ActivityItem } from '@/lib/api/types'
import { formatUsdc, ordinal, shortAddress } from '@/lib/money'

/** One plain sentence per on-chain event. */
export function describeActivity(a: Pick<ActivityItem, 'kind' | 'actorWallet' | 'position' | 'amount' | 'fee'>): string {
  const who = a.actorWallet ? shortAddress(a.actorWallet) : 'Someone'
  const amount = a.amount !== null ? formatUsdc(a.amount, 4) : null
  switch (a.kind) {
    case 'created':
      return `${who} created the bounty`
    case 'funded':
      return `${who} funded ${amount ?? ''} USDC${a.fee ? ` and paid a ${formatUsdc(a.fee, 4)} USDC fee` : ''}`.replace('  ', ' ')
    case 'submitted':
      return `${who} submitted work`
    case 'winner':
      return `${who} was picked for ${a.position ? ordinal(a.position) : 'a'} place${amount ? `, ${amount} USDC` : ''}`
    case 'approved':
      return `${who} approved ${a.position ?? 'the'} ${a.position === 1 ? 'winner' : 'winners'}${amount && amount !== '0' ? ` and got ${amount} USDC back` : ''}`
    case 'claimed':
      return `${who} claimed ${amount ?? ''} USDC${a.fee ? ` (fee ${formatUsdc(a.fee, 4)})` : ''}`.replace('  ', ' ')
    case 'refunded':
      return `${who} took back ${amount ?? ''} USDC`.replace('  ', ' ')
    case 'cancelled':
      return `${who} cancelled the bounty`
  }
}

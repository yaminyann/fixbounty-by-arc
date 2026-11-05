import { cn } from '@/lib/cn'
import { claimFee, formatUsdc, ordinal } from '@/lib/money'
import { bpsToPercent } from '@/lib/prize'
import { AddressChip } from '@/components/ui/Address'

interface PrizeLadderProps {
  shares: number[]
  /** Gross payout per position in USDC base units. */
  payouts?: (bigint | string)[]
  winners?: string[]
  claimed?: boolean[]
  selfAddress?: string | null
  compact?: boolean
  className?: string
}

/**
 * The payout ladder: one stepped bar per prize position, scaled to its share.
 * Compact form is used in lists, the full form shows amounts, winners and claim state.
 */
export function PrizeLadder({ shares, payouts, winners, claimed, selfAddress, compact = false, className }: PrizeLadderProps) {
  const max = Math.max(...shares, 1)
  // Once winners are approved, empty places are known to be unawarded.
  const settled = (winners?.length ?? 0) > 0

  if (compact) {
    return (
      <div className={cn('space-y-1', className)} role="img" aria-label={`Prize split: ${shares.map((s, i) => `${ordinal(i + 1)} ${bpsToPercent(s)} percent`).join(', ')}`}>
        {shares.slice(0, 4).map((share, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="num w-7 text-xs text-mute">{ordinal(i + 1)}</span>
            <span
              className={cn('h-2 rounded-sm border border-ink', i === 0 ? 'bg-signal' : 'bg-ink')}
              style={{ width: `${Math.max((share / max) * 72, 6)}px` }}
            />
            <span className="num text-xs text-mute">{bpsToPercent(share)}%</span>
          </div>
        ))}
        {shares.length > 4 && <p className="pl-9 text-xs text-mute">+{shares.length - 4} more</p>}
      </div>
    )
  }

  return (
    <ol className={cn('space-y-3', className)}>
      {shares.map((share, i) => {
        const winner = winners?.[i]
        const payout = payouts?.[i] !== undefined ? BigInt(payouts[i]) : null
        const isClaimed = claimed?.[i]
        return (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display font-semibold">{ordinal(i + 1)} place</span>
              <span className="num text-sm">
                {payout !== null && <span className="font-semibold">{formatUsdc(payout)} USDC</span>}
                <span className="ml-2 text-mute">{bpsToPercent(share)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-3 rounded-sm border border-ink bg-white">
              <div className={cn('h-full rounded-[1px]', i === 0 ? 'bg-signal' : 'bg-ink')} style={{ width: `${(share / max) * 100}%` }} />
            </div>
            {(winner || (settled && payout !== null)) && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
                {winner ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <AddressChip address={winner} self={selfAddress?.toLowerCase() === winner.toLowerCase()} />
                    <span className={cn('font-semibold', isClaimed ? 'text-ok' : 'text-warn')}>{isClaimed ? 'Claimed' : 'Not claimed yet'}</span>
                  </span>
                ) : (
                  <span>Not awarded, returned to the creator</span>
                )}
                {payout !== null && winner && (
                  <span className="num">Receives {formatUsdc(payout - claimFee(payout), 4)} after the 5% fee</span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

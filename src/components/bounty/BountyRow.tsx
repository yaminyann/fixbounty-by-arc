import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import type { BountySummary } from '@/lib/api/types'
import { Status } from '@/lib/api/types'
import { describeStructure } from '@/lib/prize'
import { formatUsdc, shortAddress } from '@/lib/money'
import { timeLeft } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { StatusBadge } from '@/components/bounty/StatusBadge'

export function BountyRow({ bounty }: { bounty: BountySummary }) {
  const now = useNow()
  const live = bounty.status === Status.Funded && new Date(bounty.deadline).getTime() > now

  return (
    <li>
      <Link
        to={`/bounty/${bounty.onchainId}`}
        className="group grid gap-4 border-b border-line bg-white px-4 py-5 transition-colors hover:bg-signal-soft/50 sm:grid-cols-[1fr_auto] sm:px-6"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={bounty.status} deadline={bounty.deadline} now={now} />
            <span className="num text-xs text-mute">#{bounty.onchainId}</span>
          </div>
          <h3 className="font-display text-xl font-bold leading-snug group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">
            {bounty.title}
          </h3>
          {bounty.summary && <p className="line-clamp-2 max-w-2xl text-sm text-mute">{bounty.summary}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-mute">
            <span className="inline-flex items-center gap-1">
              <Users size={14} aria-hidden />
              {bounty.submissionCount} {bounty.submissionCount === 1 ? 'submission' : 'submissions'}
            </span>
            <span className={live ? 'font-bold text-ink' : undefined}>{timeLeft(bounty.deadline, now)}</span>
            <span className="num">by {shortAddress(bounty.creatorWallet)}</span>
            {bounty.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded bg-line/60 px-1.5 py-0.5 text-ink">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-6 sm:flex-col sm:items-end sm:justify-start">
          <div className="sm:text-right">
            <p className="num font-display text-2xl font-bold leading-none">{formatUsdc(bounty.rewardAmount)}</p>
            <p className="mt-1 text-xs text-mute">USDC prize</p>
          </div>
          <div className="space-y-1.5">
            <PrizeLadder shares={bounty.prizeShares} compact />
            <p className="text-xs text-mute sm:text-right">{describeStructure(bounty.prizeShares)}</p>
          </div>
        </div>
      </Link>
    </li>
  )
}

export function BountyRowSkeleton() {
  return (
    <li aria-hidden className="grid gap-4 border-b border-line bg-white px-4 py-5 sm:grid-cols-[1fr_auto] sm:px-6">
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-line" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-line" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-line" />
      </div>
      <div className="h-14 w-28 animate-pulse rounded bg-line" />
    </li>
  )
}

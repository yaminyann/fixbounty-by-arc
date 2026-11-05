import { Link } from 'react-router-dom'
import { Layers, Lock, Users } from 'lucide-react'
import type { BountySummary } from '@/lib/api/types'
import { Status } from '@/lib/api/types'
import { useCategories } from '@/lib/api/ecosystem'
import { describeStructure } from '@/lib/prize'
import { formatUsdc, shortAddress } from '@/lib/money'
import { timeLeft } from '@/lib/time'
import { useNow } from '@/hooks/useNow'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { StatusBadge } from '@/components/bounty/StatusBadge'
import { CategoryChip, DifficultyBadge } from '@/components/ecosystem/badges'
import { Badge } from '@/components/ui/Feedback'

export function BountyRow({ bounty }: { bounty: BountySummary }) {
  const now = useNow()
  const categories = useCategories()
  const category = categories.data?.find((c) => c.slug === bounty.category)
  const live = bounty.status === Status.Funded && new Date(bounty.deadline).getTime() > now

  return (
    <li>
      <Link
        to={`/bounty/${bounty.onchainId}`}
        className="group grid gap-4 border-b border-line bg-surface px-4 py-5 transition-colors last:border-b-0 hover:bg-ink/[0.02] sm:grid-cols-[1fr_auto] sm:px-5"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={bounty.status} deadline={bounty.deadline} now={now} />
            <CategoryChip slug={bounty.category} name={category?.name} icon={category?.icon} />
            {bounty.difficulty && <DifficultyBadge difficulty={bounty.difficulty} />}
            {bounty.workMode === 'team' && (
              <Badge tone="info">
                <Users size={12} aria-hidden /> Team
              </Badge>
            )}
            {bounty.confidential && (
              <Badge>
                <Lock size={12} aria-hidden /> Encrypted reports
              </Badge>
            )}
            {bounty.milestoneCount > 0 && (
              <Badge>
                <Layers size={12} aria-hidden /> {bounty.milestoneCount} milestones
              </Badge>
            )}
          </div>
          <h3 className="font-display text-lg font-semibold leading-snug group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{bounty.title}</h3>
          {bounty.summary && <p className="line-clamp-2 max-w-2xl text-sm text-mute">{bounty.summary}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-mute">
            {bounty.projectName && <span className="font-medium text-ink">{bounty.projectName}</span>}
            <span>
              {bounty.submissionCount} {bounty.submissionCount === 1 ? 'submission' : 'submissions'}
            </span>
            <span className={live ? 'font-medium text-ink' : undefined}>{timeLeft(bounty.deadline, now)}</span>
            <span className="num">by {shortAddress(bounty.creatorWallet)}</span>
            {bounty.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-ink/5 px-1.5 py-0.5 text-ink">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-6 sm:flex-col sm:items-end sm:justify-start">
          <div className="sm:text-right">
            <p className="num font-display text-2xl font-semibold leading-none">{formatUsdc(bounty.rewardAmount)}</p>
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
    <li aria-hidden className="grid gap-4 border-b border-line bg-surface px-4 py-5 sm:grid-cols-[1fr_auto] sm:px-5">
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-ink/5" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-ink/5" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-ink/5" />
      </div>
      <div className="h-14 w-28 animate-pulse rounded bg-ink/5" />
    </li>
  )
}

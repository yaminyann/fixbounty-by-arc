import { TxLink } from '@/components/ui/Address'
import { EmptyState } from '@/components/ui/Feedback'
import type { ActivityItem } from '@/lib/api/types'
import { describeActivity } from '@/lib/activityText'
import { timeAgo } from '@/lib/time'
import { Link } from 'react-router-dom'

/** Contract events as a plain list. Every line has its transaction, so it can be checked on the explorer. */
export function ActivityList({ items, empty = 'On-chain events appear here a few seconds after each transaction.' }: { items: ActivityItem[]; empty?: string }) {
  if (items.length === 0) return <EmptyState title="No activity yet">{empty}</EmptyState>
  return (
    <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <span className="min-w-0">
            {describeActivity(a)}
            {a.bountyTitle && (
              <>
                {' '}
                <Link to={`/bounty/${a.onchainId}`} className="text-mute underline decoration-ink/20 underline-offset-2 hover:text-ink">
                  {a.bountyTitle}
                </Link>
              </>
            )}
          </span>
          <span className="flex items-center gap-3 text-xs text-mute">
            {timeAgo(a.time)}
            <TxLink hash={a.txHash} />
          </span>
        </li>
      ))}
    </ol>
  )
}

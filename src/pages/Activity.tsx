import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TxLink } from '@/components/ui/Address'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { Segmented } from '@/components/ui/Tabs'
import { useIdentity } from '@/contexts/IdentityContext'
import { useActivity } from '@/lib/api/queries'
import { describeActivity } from '@/lib/activityText'
import { timeAgo } from '@/lib/time'

const PAGE_SIZE = 20

export default function Activity() {
  const id = useIdentity()
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [offset, setOffset] = useState(0)
  const wallet = scope === 'mine' && id.address ? id.address.toLowerCase() : undefined
  const query = useActivity({ limit: PAGE_SIZE, offset, wallet })
  const items = query.data?.items ?? []

  return (
    <div>
      <PageHeader title="Activity">
        Every event below comes from the contract, so it cannot be edited or invented. It appears a few seconds after the transaction confirms.
      </PageHeader>

      {id.address && (
        <div className="mb-4">
          <Segmented
            label="Whose activity"
            value={scope}
            onChange={(v) => {
              setScope(v)
              setOffset(0)
            }}
            items={[
              { value: 'all', label: 'Everyone' },
              { value: 'mine', label: 'My wallet' },
            ]}
          />
        </div>
      )}

      {query.isError ? (
        <ErrorState title="Activity did not load" onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="space-y-px" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No activity yet">Events show up here as people create, fund, submit to and settle bounties.</EmptyState>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-md border-2 border-ink bg-white">
          {items.map((a) => (
            <li key={a.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-sm">{describeActivity(a)}</p>
                <Link to={`/bounty/${a.onchainId}`} className="block truncate text-sm font-bold underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                  {a.bountyTitle}
                </Link>
              </div>
              <div className="flex items-center gap-3 text-xs text-mute sm:flex-col sm:items-end sm:gap-1">
                <span>{timeAgo(a.time)}</span>
                <TxLink hash={a.txHash} />
              </div>
            </li>
          ))}
        </ol>
      )}

      <Pagination className="mt-6" total={query.data?.total ?? 0} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
    </div>
  )
}

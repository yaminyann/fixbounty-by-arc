import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { Avatar } from '@/components/ui/Address'
import { EmptyState, ErrorState, PageHeader, Skeleton, SourceBadge } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Form'
import { Segmented } from '@/components/ui/Tabs'
import { useCategories } from '@/lib/api/ecosystem'
import { useLeaderboard } from '@/lib/api/collab'
import { cn } from '@/lib/cn'
import { formatUsdc, shortAddress } from '@/lib/money'

type Period = 'all' | '30d' | '90d'

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>('all')
  const [category, setCategory] = useState('')
  const categories = useCategories()
  const query = useLeaderboard({ period, category: category || undefined })

  return (
    <div>
      <PageHeader title="Leaderboard">Contributors ranked by USDC received from approved bounties.</PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          items={[
            { value: 'all', label: 'All time' },
            { value: '90d', label: '90 days' },
            { value: '30d', label: '30 days' },
          ]}
        />
        <div className="w-52">
          <label htmlFor="lb-category" className="sr-only">
            Category
          </label>
          <Select id="lb-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <SourceBadge source="chain" />
      </div>

      {query.isError ? (
        <ErrorState title="The leaderboard did not load" onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={Trophy} title="No payouts in this view yet">
          Claimed prizes appear here. Contributors can hide themselves in Settings.
        </EmptyState>
      ) : (
        <ol className={cn('divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          {query.data.items.map((e, i) => (
            <li key={e.wallet}>
              <Link to={`/u/${e.wallet}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.02]">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={cn('num w-6 text-right font-display text-lg font-semibold', i < 3 ? 'text-ink' : 'text-mute')}>{i + 1}</span>
                  <Avatar name={e.name ?? e.wallet} src={e.photo} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.name ?? shortAddress(e.wallet)}</span>
                    {e.name && <span className="num block text-xs text-mute">{shortAddress(e.wallet)}</span>}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block font-semibold">{formatUsdc(e.earned, 2)} USDC</span>
                  <span className="text-xs text-mute">
                    {e.claims} {e.claims === 1 ? 'prize' : 'prizes'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-mute">Amounts are after the 5% claim fee, read from claim events on public approved bounties. A ranking by money, not a rating of quality.</p>
    </div>
  )
}

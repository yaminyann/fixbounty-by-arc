import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Feedback'
import { useCategories } from '@/lib/api/ecosystem'
import { categoryIcon } from '@/lib/nav'

export default function Categories() {
  const query = useCategories()

  return (
    <div>
      <PageHeader title="Categories">Bounties are not only for bugs. Pick the kind of work you want to do or fund.</PageHeader>

      {query.isError ? (
        <ErrorState title="Categories did not load" onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div aria-busy className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-surface p-5">
              <Skeleton className="mb-3 h-6 w-40" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : query.data.length === 0 ? (
        <EmptyState title="No categories yet">An admin can add categories from the admin console.</EmptyState>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {query.data.map((c) => {
            const Icon = categoryIcon(c.icon)
            return (
              <li key={c.slug} className="bg-surface">
                <Link to={`/explore?category=${c.slug}`} className="group flex h-full flex-col gap-3 p-5 transition-colors hover:bg-ink/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-md bg-signal-soft text-ink">
                      <Icon size={18} aria-hidden />
                    </span>
                    <ArrowUpRight size={16} aria-hidden className="text-mute transition-colors group-hover:text-ink" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-semibold">{c.name}</h2>
                    <p className="mt-0.5 text-sm text-mute">{c.description}</p>
                  </div>
                  {c.examples.length > 0 && <p className="text-sm text-ink/80">{c.examples.join(' · ')}</p>}
                  <p className="mt-auto pt-1 text-xs text-mute">
                    <span className="num font-medium text-ink">{c.openCount}</span> open now · <span className="num">{c.totalCount}</span> listed in total
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

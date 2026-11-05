import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Plus, Search } from 'lucide-react'
import { ProjectAvatar } from '@/components/ecosystem/badges'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Skeleton, SourceBadge } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { useProjects } from '@/lib/api/ecosystem'
import { formatUsdc } from '@/lib/money'

const PAGE_SIZE = 12

export default function Projects() {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(text.trim())
      setOffset(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [text])

  const query = useProjects({ search: search || undefined, limit: PAGE_SIZE, offset })
  const items = query.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="Projects"
        actions={
          <ButtonLink to="/workspace/projects/new" variant="primary" icon={<Plus size={15} aria-hidden />}>
            Create a project
          </ButtonLink>
        }
      >
        Teams and maintainers that publish bounties. Each project has a public contribution board with verified payouts.
      </PageHeader>

      <div className="relative mb-5 max-w-md">
        <label htmlFor="project-search" className="sr-only">
          Search projects
        </label>
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <Input id="project-search" type="search" placeholder="Search projects" value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
      </div>

      {query.isError ? (
        <ErrorState title="Projects did not load" onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div aria-busy className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 bg-surface p-5">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={search ? 'No project matches that search' : 'No projects yet'}
          action={
            <ButtonLink to="/workspace/projects/new" variant="primary">
              Create the first project
            </ButtonLink>
          }
        >
          {search ? 'Try a shorter name.' : 'A project groups your bounties and shows contributors what you have funded and paid.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {items.map((p) => (
            <li key={p.id} className="bg-surface">
              <Link to={`/projects/${p.slug}`} className="block h-full space-y-3 p-5 transition-colors hover:bg-ink/[0.02]">
                <div className="flex items-center gap-3">
                  <ProjectAvatar name={p.name} logoUrl={p.logoUrl} size={36} />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-semibold leading-tight">{p.name}</h2>
                    {p.tagline && <p className="truncate text-sm text-mute">{p.tagline}</p>}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-mute">Open now</dt>
                    <dd className="num font-semibold">{p.openCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-mute">Contributors</dt>
                    <dd className="num font-semibold">{p.contributorCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-mute">Paid out</dt>
                    <dd className="num font-semibold">{formatUsdc(p.distributedAmount)} USDC</dd>
                  </div>
                </dl>
                {BigInt(p.distributedAmount) > 0n && <SourceBadge source="chain" />}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination className="mt-6" total={query.data?.total ?? 0} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
    </div>
  )
}

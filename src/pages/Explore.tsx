import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { BountyRow, BountyRowSkeleton } from '@/components/bounty/BountyRow'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { Segmented } from '@/components/ui/Tabs'
import { useBounties, type BountyFilters } from '@/lib/api/queries'

const PAGE_SIZE = 10

type View = 'open' | 'picked' | 'paid' | 'all'

const VIEWS: Record<View, Pick<BountyFilters, 'status' | 'open'>> = {
  open: { status: '1', open: true },
  picked: { status: '2' },
  paid: { status: '3' },
  all: {},
}

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'reward', label: 'Highest prize' },
  { value: 'deadline', label: 'Ending soonest' },
  { value: 'popular', label: 'Most submissions' },
] as const

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) in VIEWS ? (params.get('view') as View) : 'open'
  const sort = (SORTS.find((s) => s.value === params.get('sort'))?.value ?? 'newest') as BountyFilters['sort']
  const offset = Math.max(Number(params.get('offset')) || 0, 0)
  const urlSearch = params.get('q') ?? ''

  const [text, setText] = useState(urlSearch)
  useEffect(() => {
    setText(urlSearch)
  }, [urlSearch])

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    if (text === urlSearch) return
    const id = window.setTimeout(() => update({ q: text, offset: undefined }), 300)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const query = useBounties({ ...VIEWS[view], sort, search: urlSearch || undefined, limit: PAGE_SIZE, offset })
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0

  return (
    <div>
      <PageHeader
        title="Explore bounties"
        actions={
          <ButtonLink to="/create" variant="primary">
            Post a bounty
          </ButtonLink>
        }
      >
        Every bounty here has its prize locked in the contract and has been reviewed by an admin.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="bounty-search" className="sr-only">
            Search bounties
          </label>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input
            id="bounty-search"
            type="search"
            placeholder="Search by title, description or tag"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Segmented
          label="Bounty state"
          value={view}
          onChange={(v) => update({ view: v === 'open' ? undefined : v, offset: undefined })}
          items={[
            { value: 'open', label: 'Open for work' },
            { value: 'picked', label: 'Winners picked' },
            { value: 'paid', label: 'Paid out' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="w-44">
          <label htmlFor="bounty-sort" className="sr-only">
            Sort by
          </label>
          <Select id="bounty-sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? undefined : e.target.value, offset: undefined })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <p className="mb-2 min-h-5 text-sm text-mute" aria-live="polite">
        {query.isSuccess && `${total} ${total === 1 ? 'bounty' : 'bounties'}${urlSearch ? ` matching “${urlSearch}”` : ''}`}
      </p>

      {query.isError ? (
        <ErrorState title="Bounties did not load" message="The server could not be reached." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <ul aria-busy className="overflow-hidden rounded-md border-2 border-ink">
          {Array.from({ length: 4 }, (_, i) => (
            <BountyRowSkeleton key={i} />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          title={urlSearch ? 'Nothing matches that search' : 'No bounties here yet'}
          action={
            urlSearch || view !== 'all' ? (
              <button
                type="button"
                className="h-10 rounded border-2 border-ink bg-white px-4 text-sm font-bold hover:bg-signal-soft"
                onClick={() => setParams({}, { replace: true })}
              >
                Clear search and filters
              </button>
            ) : (
              <ButtonLink to="/create" variant="primary">
                Post a bounty
              </ButtonLink>
            )
          }
        >
          {urlSearch ? 'Try a shorter search, or a tag such as react or rust.' : 'Bounties show up here after an admin approves them.'}
        </EmptyState>
      ) : (
        <ul className={`overflow-hidden rounded-md border-2 border-ink transition-opacity ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
          {items.map((b) => (
            <BountyRow key={b.id} bounty={b} />
          ))}
        </ul>
      )}

      <Pagination className="mt-6" total={total} limit={PAGE_SIZE} offset={offset} onChange={(o) => { update({ offset: o ? String(o) : undefined }); window.scrollTo({ top: 0 }) }} />
    </div>
  )
}

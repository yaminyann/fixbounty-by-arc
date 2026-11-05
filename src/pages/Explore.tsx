import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { BountyRow, BountyRowSkeleton } from '@/components/bounty/BountyRow'
import { SaveSearchButton } from '@/components/ecosystem/SaveSearch'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { useBounties, type BountyFilters } from '@/lib/api/queries'
import { useCategories } from '@/lib/api/ecosystem'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 10

type State = 'open' | 'in_progress' | 'completed' | 'cancelled' | 'all'

const STATES: { value: State; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
]

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'reward', label: 'Highest prize' },
  { value: 'deadline', label: 'Ending soonest' },
  { value: 'popular', label: 'Most submissions' },
] as const

const DEADLINES = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Within 24 hours' },
  { value: '7', label: 'Within a week' },
  { value: '30', label: 'Within a month' },
]

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-medium text-mute">{label}</legend>
      {children}
    </fieldset>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-ink text-white' : 'text-ink hover:bg-ink/5',
      )}
    >
      {children}
    </button>
  )
}

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const categories = useCategories()

  const state = (STATES.find((s) => s.value === params.get('state'))?.value ?? 'open') as State
  const sort = (SORTS.find((s) => s.value === params.get('sort'))?.value ?? 'newest') as BountyFilters['sort']
  const category = params.get('category') ?? ''
  const difficulty = params.get('difficulty') ?? ''
  const mode = params.get('mode') === 'team' || params.get('mode') === 'solo' ? (params.get('mode') as 'team' | 'solo') : undefined
  const within = params.get('within') ?? ''
  const skill = params.get('skill') ?? ''
  const project = params.get('project') ?? ''
  const minReward = params.get('min') ?? ''
  const maxReward = params.get('max') ?? ''
  const offset = Math.max(Number(params.get('offset')) || 0, 0)
  const urlSearch = params.get('q') ?? ''

  const [text, setText] = useState(urlSearch)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries({ offset: undefined, ...patch })) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  useEffect(() => {
    setText(urlSearch)
  }, [urlSearch])

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    if (text === urlSearch) return
    const timer = window.setTimeout(() => update({ q: text }), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const filters: BountyFilters = {
    state: state === 'all' ? undefined : state,
    sort,
    search: urlSearch || undefined,
    category: category || undefined,
    difficulty: difficulty || undefined,
    mode,
    skill: skill || undefined,
    project: project || undefined,
    deadlineWithin: within ? Number(within) : undefined,
    minReward: minReward ? Number(minReward) : undefined,
    maxReward: maxReward ? Number(maxReward) : undefined,
    limit: PAGE_SIZE,
    offset,
  }
  const query = useBounties(filters)
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0

  const activeFilters = [
    category && { key: 'category', label: categories.data?.find((c) => c.slug === category)?.name ?? category },
    difficulty && { key: 'difficulty', label: difficulty },
    mode && { key: 'mode', label: mode === 'team' ? 'Team bounties' : 'Solo bounties' },
    within && { key: 'within', label: DEADLINES.find((d) => d.value === within)?.label ?? '' },
    skill && { key: 'skill', label: `Skill: ${skill}` },
    project && { key: 'project', label: `Project: ${project}` },
    (minReward || maxReward) && { key: 'reward', label: `${minReward || '0'} to ${maxReward || 'any'} USDC` },
  ].filter(Boolean) as { key: string; label: string }[]

  const clearOne = (key: string) => (key === 'reward' ? update({ min: undefined, max: undefined }) : update({ [key]: undefined }))
  const clearAll = () => setParams({}, { replace: true })

  const filterPanel = (
    <div className="space-y-6">
      <FilterGroup label="Status">
        <div role="radiogroup" aria-label="Bounty status" className="space-y-0.5">
          {STATES.map((s) => (
            <Choice key={s.value} active={state === s.value} onClick={() => update({ state: s.value === 'open' ? undefined : s.value })}>
              {s.label}
            </Choice>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Category">
        <Select aria-label="Category" value={category} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup label="Difficulty">
        <Select aria-label="Difficulty" value={difficulty} onChange={(e) => update({ difficulty: e.target.value })}>
          <option value="">Any difficulty</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
      </FilterGroup>

      <FilterGroup label="Work type">
        <Select aria-label="Work type" value={mode ?? ''} onChange={(e) => update({ mode: e.target.value })}>
          <option value="">Solo and team</option>
          <option value="solo">Solo only</option>
          <option value="team">Team only</option>
        </Select>
      </FilterGroup>

      <FilterGroup label="Prize in USDC">
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Minimum prize" inputMode="numeric" placeholder="Min" defaultValue={minReward} key={`min-${minReward}`} onBlur={(e) => update({ min: e.target.value.replace(/\D/g, '') })} />
          <Input aria-label="Maximum prize" inputMode="numeric" placeholder="Max" defaultValue={maxReward} key={`max-${maxReward}`} onBlur={(e) => update({ max: e.target.value.replace(/\D/g, '') })} />
        </div>
      </FilterGroup>

      <FilterGroup label="Deadline">
        <Select aria-label="Deadline" value={within} onChange={(e) => update({ within: e.target.value })}>
          {DEADLINES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup label="Skill">
        <Input
          aria-label="Skill"
          placeholder="react, solidity, design"
          defaultValue={skill}
          key={`skill-${skill}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') update({ skill: e.currentTarget.value.trim().toLowerCase() })
          }}
          onBlur={(e) => update({ skill: e.target.value.trim().toLowerCase() })}
        />
      </FilterGroup>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Explore bounties"
        actions={
          <ButtonLink to="/create" variant="accent" icon={<Plus size={15} aria-hidden />}>
            Post a bounty
          </ButtonLink>
        }
      >
        Every bounty has its prize locked in the contract and has been reviewed by an admin.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-20">{filterPanel}</div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <label htmlFor="bounty-search" className="sr-only">
                Search bounties
              </label>
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input id="bounty-search" type="search" placeholder="Search by title, project or skill" value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
            </div>
            <div className="w-44">
              <label htmlFor="bounty-sort" className="sr-only">
                Sort by
              </label>
              <Select id="bounty-sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? undefined : e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <SaveSearchButton
              filters={{
                q: urlSearch || undefined,
                category: category || undefined,
                difficulty: difficulty || undefined,
                mode,
                skill: skill || undefined,
                project: project || undefined,
                min: minReward ? Number(minReward) : undefined,
                max: maxReward ? Number(maxReward) : undefined,
              }}
            />
            <Button className="lg:hidden" icon={<SlidersHorizontal size={15} aria-hidden />} onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
              Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ''}
            </Button>
          </div>

          {filtersOpen && <div className="rounded-lg border border-line bg-surface p-4 lg:hidden">{filterPanel}</div>}

          {activeFilters.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {activeFilters.map((f) => (
                <li key={f.key}>
                  <button
                    type="button"
                    onClick={() => clearOne(f.key)}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1.5 text-xs font-medium hover:border-ink/30"
                  >
                    {f.label}
                    <X size={12} aria-label="Remove filter" />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={clearAll} className="text-xs font-medium text-mute underline underline-offset-2 hover:text-ink">
                  Clear all
                </button>
              </li>
            </ul>
          )}

          <p className="min-h-5 text-sm text-mute" aria-live="polite">
            {query.isSuccess && `${total} ${total === 1 ? 'bounty' : 'bounties'}${urlSearch ? ` matching “${urlSearch}”` : ''}`}
          </p>

          {query.isError ? (
            <ErrorState title="Bounties did not load" message="The server could not be reached." onRetry={() => void query.refetch()} />
          ) : query.isPending ? (
            <ul aria-busy className="overflow-hidden rounded-lg border border-line">
              {Array.from({ length: 4 }, (_, i) => (
                <BountyRowSkeleton key={i} />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Search}
              title={urlSearch || activeFilters.length > 0 ? 'Nothing matches these filters' : 'No bounties here yet'}
              action={
                urlSearch || activeFilters.length > 0 || state !== 'open' ? (
                  <Button onClick={clearAll}>Clear search and filters</Button>
                ) : (
                  <ButtonLink to="/create" variant="primary">
                    Post a bounty
                  </ButtonLink>
                )
              }
            >
              {urlSearch || activeFilters.length > 0 ? 'Try fewer filters, or search for a skill such as react or rust.' : 'Bounties show up here after an admin approves them.'}
            </EmptyState>
          ) : (
            <ul className={cn('overflow-hidden rounded-lg border border-line bg-surface transition-opacity', query.isPlaceholderData && 'opacity-60')}>
              {items.map((b) => (
                <BountyRow key={b.id} bounty={b} />
              ))}
            </ul>
          )}

          <Pagination
            className="pt-2"
            total={total}
            limit={PAGE_SIZE}
            offset={offset}
            onChange={(o) => {
              update({ offset: o ? String(o) : undefined })
              window.scrollTo({ top: 0 })
            }}
          />
        </div>
      </div>
    </div>
  )
}

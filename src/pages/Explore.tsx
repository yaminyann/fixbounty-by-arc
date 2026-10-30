import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  SlidersHorizontal,
  RefreshCw,
  Tag,
  ArrowUpDown,
  X,
  Sparkles,
  Filter,
} from 'lucide-react'
import { useBountyCount, useBounties } from '@/hooks/useBounty'
import { BountyCard } from '@/components/ui/BountyCard'
import { Pagination } from '@/components/ui/Pagination'
import { BountyStatus } from '@/lib/bountyTypes'
import { getRecentBountyMetas, type BountyMeta } from '@/lib/firestore'
import { apiGetBounties, apiGetCategories, type ApiCategory } from '@/lib/api'

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: String(BountyStatus.Open), label: 'Open' },
  { value: String(BountyStatus.Funded), label: 'Funded' },
  { value: String(BountyStatus.Approved), label: 'Approved' },
  { value: String(BountyStatus.Claimed), label: 'Claimed' },
]

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'reward_desc', label: 'Highest Reward' },
  { value: 'reward_asc', label: 'Lowest Reward' },
  { value: 'deadline_asc', label: 'Ending Soonest' },
]

export function Explore() {
  const [searchParams, setSearchParams] = useSearchParams()

  const { count, isLoading: countLoading, refetch: refetchCount } = useBountyCount()
  const allIds = useMemo(() => Array.from({ length: count }, (_, i) => count - i), [count])
  const { bounties, isLoading, refetch } = useBounties(allIds)

  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [metas, setMetas] = useState<Record<number, BountyMeta>>({})

  // URL-synchronized state
  const search = searchParams.get('q') || ''
  const statusFilter = searchParams.get('status') || 'all'
  const selectedCategory = searchParams.get('category') || 'all'
  const sortBy = searchParams.get('sort') || 'newest'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.max(6, parseInt(searchParams.get('pageSize') || '12', 10))

  const updateFilters = (updates: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, val] of Object.entries(updates)) {
          if (val === null || val === '' || val === 'all' || (key === 'page' && val === '1') || (key === 'pageSize' && val === '12') || (key === 'sort' && val === 'newest')) {
            next.delete(key)
          } else {
            next.set(key, val)
          }
        }
        return next
      },
      { replace: true }
    )
  }

  const handleSearchChange = (val: string) => {
    updateFilters({ q: val || null, page: '1' })
  }

  const handleStatusChange = (val: string) => {
    updateFilters({ status: val, page: '1' })
  }

  const handleCategoryChange = (val: string) => {
    updateFilters({ category: val, page: '1' })
  }

  const handleSortChange = (val: string) => {
    updateFilters({ sort: val, page: '1' })
  }

  const handlePageChange = (newPage: number) => {
    updateFilters({ page: String(newPage) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (newSize: number) => {
    updateFilters({ pageSize: String(newSize), page: '1' })
  }

  const resetAllFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  useEffect(() => {
    // 0. Load categories
    apiGetCategories()
      .then((cats) => {
        if (cats && cats.length > 0) setCategories(cats)
      })
      .catch(() => {})

    // 1. Query PostgreSQL API
    apiGetBounties()
      .then((list) => {
        const map: Record<number, BountyMeta> = {}
        for (const b of list) {
          if (b.onchainId) {
            map[b.onchainId] = {
              bountyId: b.onchainId,
              creatorUid: b.creatorUserId || 'anonymous',
              creatorAddress: b.creatorWallet,
              description: b.description,
              acceptanceCriteria: b.acceptanceCriteria,
              objectives: b.objectives ?? undefined,
              requirements: b.requirements ?? undefined,
              rules: b.rules ?? undefined,
              eligibility: b.eligibility ?? undefined,
              deliverables: b.deliverables ?? undefined,
              submissionInstructions: b.submissionInstructions ?? undefined,
              tags: b.tags,
              links: b.links,
              categorySlug: b.categorySlug ?? undefined,
              imageUrl: b.imageUrl ?? undefined,
              moderationStatus: b.moderationStatus,
              moderationNote: b.moderationNote ?? undefined,
            }
          }
        }
        setMetas((prev) => ({ ...map, ...prev }))
      })
      .catch(() => {})

    // 2. Query Firestore fallback
    getRecentBountyMetas(100)
      .then((list) => {
        const map: Record<number, BountyMeta> = {}
        for (const m of list) map[m.bountyId] = m
        setMetas((prev) => ({ ...map, ...prev }))
      })
      .catch(() => {})
  }, [])

  const filteredAndSorted = useMemo(() => {
    let list = [...bounties]

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((b) => (b.status as number) === Number(statusFilter))
    }

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((b) => metas[b.id]?.categorySlug === selectedCategory)
    }

    // Search query filter
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((b) => {
        const matchTitle = b.title.toLowerCase().includes(q)
        const matchTag = metas[b.id]?.tags?.some((t) => t.toLowerCase().includes(q))
        const matchDesc = metas[b.id]?.description?.toLowerCase().includes(q)
        const matchCat = metas[b.id]?.categorySlug?.toLowerCase().includes(q)
        return matchTitle || matchTag || matchDesc || matchCat
      })
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'oldest') {
        return a.id - b.id
      }
      if (sortBy === 'reward_desc') {
        return Number(b.reward) > Number(a.reward) ? 1 : -1
      }
      if (sortBy === 'reward_asc') {
        return Number(a.reward) > Number(b.reward) ? 1 : -1
      }
      if (sortBy === 'deadline_asc') {
        return a.deadline.getTime() - b.deadline.getTime()
      }
      // Default: newest
      return b.id - a.id
    })

    return list
  }, [bounties, statusFilter, selectedCategory, search, metas, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize))
  const paged = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize)

  const hasActiveFilters = Boolean(search || statusFilter !== 'all' || selectedCategory !== 'all' || sortBy !== 'newest')

  const handleRefresh = () => {
    void refetchCount()
    void refetch()
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-black uppercase tracking-wider bg-yellow-300 border border-black shadow-[1px_1px_0px_black]">
              Public Registry
            </span>
            <span className="text-xs text-gray-500 font-mono">Arc Testnet</span>
          </div>
          <h1 className="font-display font-black text-3xl tracking-tight">Explore Bounties</h1>
          <p className="text-sm text-gray-600 mt-1">
            Discover verified open-source tasks backed by programmatic USDC escrow smart contracts.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="border-2 border-black bg-white px-3 py-1.5 shadow-[2px_2px_0px_black] text-xs font-mono">
            <span className="text-gray-500">Live: </span>
            <span className="font-bold">{countLoading ? '…' : count}</span>
            <span className="text-gray-500"> bounties</span>
          </div>
          <button
            onClick={handleRefresh}
            className="border-2 border-black p-2 bg-white hover:bg-yellow-300 active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_black]"
            title="Refresh contract registry"
            aria-label="Refresh contract registry"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Primary Search & Controls Toolbar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Search Input */}
        <div className="lg:col-span-5 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search by title, tag, or description…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full border-2 border-black pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white font-medium shadow-[2px_2px_0px_black]"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black p-0.5"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div className="lg:col-span-4 flex items-center">
          <div className="flex w-full border-2 border-black bg-white shadow-[2px_2px_0px_black] overflow-x-auto">
            {STATUS_FILTER_OPTIONS.map(({ value, label }) => {
              const active = statusFilter === value
              return (
                <button
                  key={value}
                  onClick={() => handleStatusChange(value)}
                  className={`flex-1 min-w-[70px] py-2 px-2 text-xs font-bold border-r border-black last:border-r-0 text-center transition-colors whitespace-nowrap ${
                    active ? 'bg-black text-white' : 'bg-white hover:bg-yellow-200 text-black'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Sort Dropdown */}
        <div className="lg:col-span-3 flex items-center">
          <div className="relative w-full">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="w-full border-2 border-black pl-8 pr-4 py-2.5 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-yellow-300 shadow-[2px_2px_0px_black] cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Category Pills Slider */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 text-xs scrollbar-thin">
          <span className="font-bold flex items-center gap-1 text-gray-500 shrink-0 mr-1">
            <Tag size={12} />
            Category:
          </span>
          <button
            onClick={() => handleCategoryChange('all')}
            className={`px-3 py-1 border-2 border-black font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'all'
                ? 'bg-black text-white shadow-[2px_2px_0px_#EAB308]'
                : 'bg-white hover:bg-yellow-100 text-black shadow-[1px_1px_0px_black]'
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const active = selectedCategory === cat.slug
            return (
              <button
                key={cat.slug}
                onClick={() => handleCategoryChange(cat.slug)}
                className={`px-3 py-1 border-2 border-black font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-yellow-300 text-black shadow-[2px_2px_0px_black]'
                    : 'bg-white hover:bg-yellow-100 text-black shadow-[1px_1px_0px_black]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full border border-black"
                  style={{ backgroundColor: cat.color || '#FDE047' }}
                />
                {cat.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-yellow-50 border-2 border-black shadow-[2px_2px_0px_black] text-xs">
          <span className="font-bold flex items-center gap-1 text-gray-700">
            <Filter size={12} />
            Active Filters:
          </span>

          {search && (
            <span className="inline-flex items-center gap-1 bg-white border border-black px-2 py-0.5 font-bold">
              Query: &quot;{search}&quot;
              <button onClick={() => handleSearchChange('')} className="hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          )}

          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-white border border-black px-2 py-0.5 font-bold">
              Status: {STATUS_FILTER_OPTIONS.find((s) => s.value === statusFilter)?.label}
              <button onClick={() => handleStatusChange('all')} className="hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          )}

          {selectedCategory !== 'all' && (
            <span className="inline-flex items-center gap-1 bg-white border border-black px-2 py-0.5 font-bold">
              Category: {categories.find((c) => c.slug === selectedCategory)?.name || selectedCategory}
              <button onClick={() => handleCategoryChange('all')} className="hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          )}

          {sortBy !== 'newest' && (
            <span className="inline-flex items-center gap-1 bg-white border border-black px-2 py-0.5 font-bold">
              Sorted: {SORT_OPTIONS.find((s) => s.value === sortBy)?.label}
              <button onClick={() => handleSortChange('newest')} className="hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          )}

          <button
            onClick={resetAllFilters}
            className="ml-auto text-xs font-bold underline text-gray-700 hover:text-black cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Bounties Grid / Loading / Empty */}
      {isLoading || countLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black] space-y-4 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-6 bg-gray-200 rounded w-3/4" />
              <div className="h-16 bg-gray-100 rounded w-full" />
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-1/4" />
                <div className="h-4 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="border-2 border-black bg-white p-12 text-center shadow-[6px_6px_0px_black] space-y-4">
          <div className="w-12 h-12 bg-yellow-300 border-2 border-black rounded-none flex items-center justify-center mx-auto shadow-[2px_2px_0px_black]">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg mb-1">No bounties match your criteria</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              {hasActiveFilters
                ? 'Try clearing some of your search terms or active category/status filters.'
                : 'No bounties are currently available on Arc Testnet. Check back soon or create one yourself!'}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetAllFilters}
              className="inline-flex items-center gap-2 border-2 border-black bg-yellow-300 text-black px-4 py-2 font-bold text-xs uppercase tracking-wider hover:bg-yellow-400 shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500 font-mono px-1">
            <span>
              Showing {paged.length} of {filteredAndSorted.length} matching bounties
            </span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paged.map((bounty) => (
              <BountyCard
                key={bounty.id}
                bounty={bounty}
                tags={metas[bounty.id]?.tags ?? []}
                categorySlug={metas[bounty.id]?.categorySlug}
                imageUrl={metas[bounty.id]?.imageUrl}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pt-4 border-t-2 border-black">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={filteredAndSorted.length}
                pageSize={pageSize}
                pageSizeOptions={[6, 12, 24, 48]}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useState, useMemo, useEffect } from 'react'
import { Search, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { useBountyCount, useBounties } from '@/hooks/useBounty'
import { BountyCard } from '@/components/ui/BountyCard'
import { BountyStatus } from '@/lib/bountyTypes'
import { getRecentBountyMetas, type BountyMeta } from '@/lib/firestore'
import { apiGetBounties } from '@/lib/api'

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: String(BountyStatus.Open), label: 'Open' },
  { value: String(BountyStatus.Funded), label: 'Funded' },
  { value: String(BountyStatus.Approved), label: 'Approved' },
  { value: String(BountyStatus.Claimed), label: 'Claimed' },
]

const PAGE_SIZE = 12

export function Explore() {
  const { count, isLoading: countLoading, refetch: refetchCount } = useBountyCount()
  const allIds = useMemo(() => Array.from({ length: count }, (_, i) => count - i), [count])
  const { bounties, isLoading, refetch } = useBounties(allIds)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [metas, setMetas] = useState<Record<number, BountyMeta>>({})

  useEffect(() => {
    // 1. Query PostgreSQL API
    apiGetBounties().then((list) => {
      const map: Record<number, BountyMeta> = {}
      for (const b of list) {
        if (b.onchainId) {
          map[b.onchainId] = {
            bountyId: b.onchainId,
            creatorUid: b.creatorUserId || 'anonymous',
            creatorAddress: b.creatorWallet,
            description: b.description,
            acceptanceCriteria: b.acceptanceCriteria,
            tags: b.tags,
            links: b.links,
          }
        }
      }
      setMetas((prev) => ({ ...map, ...prev }))
    }).catch(() => {})

    // 2. Query Firestore fallback
    getRecentBountyMetas(100).then((list) => {
      const map: Record<number, BountyMeta> = {}
      for (const m of list) map[m.bountyId] = m
      setMetas((prev) => ({ ...map, ...prev }))
    }).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    let list = bounties
    if (statusFilter !== 'all') {
      list = list.filter((b) => (b.status as number) === Number(statusFilter))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((b) => {
        const matchTitle = b.title.toLowerCase().includes(q)
        const matchTag = metas[b.id]?.tags?.some((t) => t.toLowerCase().includes(q))
        const matchDesc = metas[b.id]?.description?.toLowerCase().includes(q)
        return matchTitle || matchTag || matchDesc
      })
    }
    return list
  }, [bounties, statusFilter, search, metas])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleRefresh = () => {
    void refetchCount()
    void refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tight">Explore Bounties</h1>
          {!countLoading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {count} {count === 1 ? 'bounty' : 'bounties'} posted
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          className="border-2 border-black p-2 hover:bg-yellow-300 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search bounties…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full border-2 border-black pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-gray-500" />
          <div className="flex border-2 border-black">
            {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setStatusFilter(value); setPage(1) }}
                className={`px-3 py-2 text-xs font-bold border-r border-black last:border-r-0 transition-colors ${
                  statusFilter === value ? 'bg-black text-white' : 'bg-white hover:bg-yellow-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {isLoading || countLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 border-2 border-gray-200 bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-black bg-white p-12 text-center shadow-[4px_4px_0px_black]">
          <p className="font-bold text-lg mb-2">No bounties found</p>
          <p className="text-gray-500 text-sm">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Be the first to post a bounty!'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map((bounty) => (
              <BountyCard
                key={bounty.id}
                bounty={bounty}
                tags={metas[bounty.id]?.tags ?? []}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="border-2 border-black px-3 py-1.5 text-sm font-bold hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm font-medium tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="border-2 border-black px-3 py-1.5 text-sm font-bold hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

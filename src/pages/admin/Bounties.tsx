import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select } from '@/components/ui/Form'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { useAdminBounties } from '@/lib/api/queries'
import type { AdminBounty } from '@/lib/api/types'
import { formatUsdc, shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'
import { ReviewDialog } from '@/pages/admin/ReviewDialog'

const LIMIT = 15

/** `queue` is the pending-only review list; `all` lets admins filter every bounty and change earlier decisions. */
export function AdminBounties({ mode }: { mode: 'queue' | 'all' }) {
  const [moderation, setModeration] = useState(mode === 'queue' ? 'pending' : 'all')
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<AdminBounty | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(text.trim())
      setOffset(0)
    }, 300)
    return () => window.clearTimeout(id)
  }, [text])

  const query = useAdminBounties({ moderation, status: status || undefined, search: search || undefined, limit: LIMIT, offset })

  const columns: Column<AdminBounty>[] = [
    {
      header: 'Bounty',
      cell: (b) => (
        <div className="max-w-xs space-y-1">
          <p className="font-bold leading-snug">
            <span className="num mr-1 text-mute">#{b.onchainId}</span>
            {b.title}
          </p>
          <p className="text-xs text-mute">{timeAgo(b.createdAt)}</p>
        </div>
      ),
    },
    {
      header: 'Creator',
      cell: (b) => (
        <div className="text-xs">
          <p className="font-medium">{b.creatorEmail ?? 'No account'}</p>
          <p className="num text-mute">{shortAddress(b.creatorWallet)}</p>
        </div>
      ),
    },
    { header: 'Prize', align: 'right', cell: (b) => <span className="num font-bold">{formatUsdc(b.rewardAmount)}</span> },
    { header: 'Chain state', cell: (b) => <StatusBadge status={b.status} deadline={b.deadline} /> },
    {
      header: 'Review',
      cell: (b) => (b.metadataVerified ? <ModerationBadge status={b.moderationStatus} /> : <span className="text-xs text-mute">Not published</span>),
    },
    {
      header: 'Action',
      align: 'right',
      cell: (b) => (
        <Button size="sm" variant={b.moderationStatus === 'pending' && b.metadataVerified ? 'primary' : 'secondary'} onClick={() => setSelected(b)}>
          {b.moderationStatus === 'pending' ? 'Review' : 'Open'}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="admin-bounty-search" className="sr-only">
            Search bounties
          </label>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input id="admin-bounty-search" type="search" className="pl-9" placeholder="Search title, creator email or wallet" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {mode === 'all' && (
          <>
            <div className="w-44">
              <label htmlFor="admin-mod" className="sr-only">Review state</label>
              <Select id="admin-mod" value={moderation} onChange={(e) => { setModeration(e.target.value); setOffset(0) }}>
                <option value="all">Any review state</option>
                <option value="pending">Waiting for review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="unpublished">Not published</option>
              </Select>
            </div>
            <div className="w-44">
              <label htmlFor="admin-status" className="sr-only">Chain state</label>
              <Select id="admin-status" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
                <option value="">Any chain state</option>
                <option value="0">Awaiting funding</option>
                <option value="1">Funded</option>
                <option value="2">Winners picked</option>
                <option value="3">Paid out</option>
                <option value="4">Refunded</option>
                <option value="5">Cancelled</option>
              </Select>
            </div>
          </>
        )}
      </div>

      <DataTable
        caption={mode === 'queue' ? 'Bounties waiting for review' : 'All bounties'}
        columns={columns}
        rows={query.data?.items}
        rowKey={(b) => b.id}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        dimmed={query.isPlaceholderData}
        emptyTitle={mode === 'queue' ? 'The review queue is empty' : 'No bounties match'}
        emptyHint={mode === 'queue' ? 'New bounties appear here once their creators publish and fund them.' : 'Try clearing the filters.'}
        page={query.data ? { total: query.data.total, limit: LIMIT, offset, onChange: setOffset } : undefined}
      />

      <ReviewDialog bounty={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

export const ReviewQueue = () => <AdminBounties mode="queue" />
export const AllBounties = () => <AdminBounties mode="all" />

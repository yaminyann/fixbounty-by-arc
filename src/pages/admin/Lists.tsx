import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { AddressChip, Avatar, TxLink } from '@/components/ui/Address'
import { Badge, Callout, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Form'
import { Segmented } from '@/components/ui/Tabs'
import {
  useAdminActivity,
  useAdminAudit,
  useAdminRevenue,
  useAdminSubmissions,
  useAdminSystem,
  useAdminUsers,
} from '@/lib/api/queries'
import type { AdminActivity, AdminFee, AdminSubmission, AdminUser, AuditEntry } from '@/lib/api/types'
import { describeActivity } from '@/lib/activityText'
import { formatUsdc, ordinal } from '@/lib/money'
import { formatDate, timeAgo } from '@/lib/time'
import { Link } from 'react-router-dom'

const LIMIT = 20

function useSearch() {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(text.trim())
      setOffset(0)
    }, 300)
    return () => window.clearTimeout(id)
  }, [text])
  return { text, setText, search, offset, setOffset }
}

function SearchBox({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative max-w-md">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
      <Input id={id} type="search" className="pl-9" placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function Submissions() {
  const s = useSearch()
  const q = useAdminSubmissions({ search: s.search || undefined, limit: LIMIT, offset: s.offset })
  const columns: Column<AdminSubmission>[] = [
    {
      header: 'Bounty',
      cell: (r) => (
        <Link className="font-semibold underline decoration-ink/30 underline-offset-2 hover:decoration-ink" to={`/bounty/${r.onchainId}`}>
          #{r.onchainId} {r.bountyTitle}
        </Link>
      ),
    },
    {
      header: 'Contributor',
      cell: (r) => (
        <div className="space-y-1 text-xs">
          <p className="font-medium">{r.submitterEmail ?? 'No account'}</p>
          <AddressChip address={r.submitterWallet} />
        </div>
      ),
    },
    { header: 'Notes', cell: (r) => (r.notesVerified ? <Badge tone="ok">Attached</Badge> : <Badge tone="warn">Missing</Badge>) },
    { header: 'Result', cell: (r) => (r.position ? <Badge tone="signal">{ordinal(r.position)} place</Badge> : <span className="text-xs text-mute">None</span>) },
    { header: 'Sent', cell: (r) => <span className="text-xs text-mute">{timeAgo(r.createdAt)}</span> },
  ]
  return (
    <div className="space-y-4">
      <SearchBox id="sub-search" label="Search bounty, email or wallet" value={s.text} onChange={s.setText} />
      <DataTable
        caption="Submissions"
        columns={columns}
        rows={q.data?.items}
        rowKey={(r) => r.id}
        loading={q.isPending}
        error={q.isError}
        onRetry={() => void q.refetch()}
        dimmed={q.isPlaceholderData}
        emptyTitle="No submissions"
        page={q.data ? { total: q.data.total, limit: LIMIT, offset: s.offset, onChange: s.setOffset } : undefined}
      />
    </div>
  )
}

export function Users() {
  const s = useSearch()
  const q = useAdminUsers({ search: s.search || undefined, limit: LIMIT, offset: s.offset })
  const columns: Column<AdminUser>[] = [
    {
      header: 'User',
      cell: (u) => (
        <div className="flex items-center gap-2">
          <Avatar name={u.displayName ?? u.email} src={u.photoUrl} size={28} />
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold">{u.displayName ?? 'No name'}</p>
            <p className="truncate text-mute">{u.email}</p>
          </div>
        </div>
      ),
    },
    { header: 'Wallet', cell: (u) => (u.wallet ? <AddressChip address={u.wallet} /> : <span className="text-xs text-mute">Not linked</span>) },
    { header: 'Bounties', align: 'right', cell: (u) => <span className="num">{u.bounties}</span> },
    { header: 'Submissions', align: 'right', cell: (u) => <span className="num">{u.submissions}</span> },
    { header: 'Last seen', cell: (u) => <span className="text-xs text-mute">{timeAgo(u.lastSeenAt)}</span> },
    { header: 'Joined', cell: (u) => <span className="text-xs text-mute">{formatDate(u.createdAt)}</span> },
  ]
  return (
    <div className="space-y-4">
      <SearchBox id="user-search" label="Search name, email or wallet" value={s.text} onChange={s.setText} />
      <DataTable
        caption="Users"
        columns={columns}
        rows={q.data?.items}
        rowKey={(u) => u.id}
        loading={q.isPending}
        error={q.isError}
        onRetry={() => void q.refetch()}
        dimmed={q.isPlaceholderData}
        emptyTitle="No users"
        page={q.data ? { total: q.data.total, limit: LIMIT, offset: s.offset, onChange: s.setOffset } : undefined}
      />
    </div>
  )
}

export function Revenue() {
  const [kind, setKind] = useState<'all' | '0' | '1'>('all')
  const [offset, setOffset] = useState(0)
  const q = useAdminRevenue({ kind: kind === 'all' ? undefined : kind, limit: LIMIT, offset })
  const columns: Column<AdminFee>[] = [
    { header: 'When', cell: (f) => <span className="text-xs">{formatDate(f.time, true)}</span> },
    { header: 'Type', cell: (f) => (f.kind === 0 ? <Badge tone="info">Post fee 0.5%</Badge> : <Badge tone="ok">Claim fee 5%</Badge>) },
    { header: 'Amount (USDC)', align: 'right', cell: (f) => <span className="num font-semibold">{formatUsdc(f.amount, 4)}</span> },
    {
      header: 'Bounty',
      cell: (f) => (
        <Link className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink" to={`/bounty/${f.onchainId}`}>
          #{f.onchainId} {f.bountyTitle}
        </Link>
      ),
    },
    { header: 'Paid by', cell: (f) => <AddressChip address={f.payerWallet} /> },
    { header: 'Transaction', cell: (f) => <TxLink hash={f.txHash} /> },
  ]
  return (
    <div className="space-y-4">
      <Segmented
        label="Fee type"
        value={kind}
        onChange={(v) => {
          setKind(v)
          setOffset(0)
        }}
        items={[
          { value: 'all', label: 'All fees' },
          { value: '0', label: 'Post fees' },
          { value: '1', label: 'Claim fees' },
        ]}
      />
      <DataTable
        caption="Platform fee payments"
        columns={columns}
        rows={q.data?.items}
        rowKey={(f) => f.id}
        loading={q.isPending}
        error={q.isError}
        onRetry={() => void q.refetch()}
        dimmed={q.isPlaceholderData}
        emptyTitle="No fees collected yet"
        emptyHint="Fees show up after the first bounty is funded."
        page={q.data ? { total: q.data.total, limit: LIMIT, offset, onChange: setOffset } : undefined}
      />
    </div>
  )
}

export function ChainActivity() {
  const [offset, setOffset] = useState(0)
  const q = useAdminActivity({ limit: 30, offset })
  const columns: Column<AdminActivity>[] = [
    { header: 'When', cell: (a) => <span className="text-xs">{formatDate(a.time, true)}</span> },
    { header: 'Event', cell: (a) => <span>{describeActivity(a)}</span> },
    {
      header: 'Bounty',
      cell: (a) => (
        <div className="space-y-1">
          <Link className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink" to={`/bounty/${a.onchainId}`}>
            #{a.onchainId} {a.bountyTitle}
          </Link>
          {a.moderationStatus !== 'approved' && <p className="text-xs text-warn">{a.moderationStatus === 'pending' ? 'Not public yet' : 'Hidden'}</p>}
        </div>
      ),
    },
    { header: 'Transaction', cell: (a) => <TxLink hash={a.txHash} /> },
  ]
  return (
    <DataTable
      caption="Contract events"
      columns={columns}
      rows={q.data?.items}
      rowKey={(a) => a.id}
      loading={q.isPending}
      error={q.isError}
      onRetry={() => void q.refetch()}
      dimmed={q.isPlaceholderData}
      emptyTitle="No contract events yet"
      page={q.data ? { total: q.data.total, limit: 30, offset, onChange: setOffset } : undefined}
    />
  )
}

export function Audit() {
  const [offset, setOffset] = useState(0)
  const q = useAdminAudit({ limit: 30, offset })
  const columns: Column<AuditEntry>[] = [
    { header: 'When', cell: (e) => <span className="text-xs">{formatDate(e.createdAt, true)}</span> },
    { header: 'Admin', cell: (e) => <span className="text-xs font-medium">{e.adminEmail}</span> },
    { header: 'Action', cell: (e) => <span className="num text-xs">{e.action}</span> },
    { header: 'Target', cell: (e) => <span className="num text-xs">{e.targetType} #{e.targetId}</span> },
    {
      header: 'Note',
      cell: (e) => <span className="text-xs text-mute">{typeof e.detail?.note === 'string' ? e.detail.note : ''}</span>,
    },
  ]
  return (
    <DataTable
      caption="Admin actions"
      columns={columns}
      rows={q.data?.items}
      rowKey={(e) => e.id}
      loading={q.isPending}
      error={q.isError}
      onRetry={() => void q.refetch()}
      dimmed={q.isPlaceholderData}
      emptyTitle="No admin actions recorded"
      emptyHint="Approvals and rejections are logged here."
      page={q.data ? { total: q.data.total, limit: 30, offset, onChange: setOffset } : undefined}
    />
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

export function System() {
  const q = useAdminSystem()
  if (q.isError) return <ErrorState title="System status did not load" onRetry={() => void q.refetch()} />
  if (q.isPending) return <Skeleton className="h-64 w-full" />
  const s = q.data
  const lagging = s.indexer.lagBlocks !== null && s.indexer.lagBlocks > 50

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="mb-2 font-display text-xl font-semibold">Chain indexer</h2>
        <dl>
          <Row label="Status">
            {!s.indexer.running ? <Badge tone="danger">Not running</Badge> : s.indexer.holdsLock ? <Badge tone="ok">Running</Badge> : <Badge tone="warn">Standby</Badge>}
          </Row>
          <Row label="Last indexed block"><span className="num">{s.indexer.lastBlock ?? 'None yet'}</span></Row>
          <Row label="Latest block"><span className="num">{s.rpc.latestBlock ?? 'Unavailable'}</span></Row>
          <Row label="Lag"><span className={`num ${lagging ? 'text-danger' : ''}`}>{s.indexer.lagBlocks ?? 'Unknown'} blocks</span></Row>
          <Row label="Last run">{s.indexer.lastRunAt ? timeAgo(s.indexer.lastRunAt) : 'Never'}</Row>
        </dl>
        {s.indexer.lastError && <Callout tone="danger" className="mt-3" title="Last error">{s.indexer.lastError}</Callout>}
      </section>

      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="mb-2 font-display text-xl font-semibold">Services</h2>
        <dl>
          <Row label="Database latency"><span className="num">{s.database.latencyMs} ms</span></Row>
          <Row label="Connections"><span className="num">{s.database.poolTotal} open, {s.database.poolIdle} idle, {s.database.poolWaiting} waiting</span></Row>
          <Row label="RPC latency"><span className="num">{s.rpc.latencyMs !== null ? `${s.rpc.latencyMs} ms` : 'Unavailable'}</span></Row>
          <Row label="Network"><span className="num">Chain {s.network.chainId}</span></Row>
        </dl>
      </section>

      <section className="rounded-md border border-line bg-white p-5 lg:col-span-2">
        <h2 className="mb-2 font-display text-xl font-semibold">Addresses and access</h2>
        <dl>
          <Row label="Bounty contract">{s.contract ? <AddressChip address={s.contract} /> : 'Not configured'}</Row>
          <Row label="USDC token"><AddressChip address={s.usdc} /></Row>
          <Row label="Fee wallet"><AddressChip address={s.treasury} /></Row>
          <Row label="Admin emails">{s.admins.length ? s.admins.join(', ') : 'None configured'}</Row>
        </dl>
      </section>
    </div>
  )
}


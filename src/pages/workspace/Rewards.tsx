import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { TxLink } from '@/components/ui/Address'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ErrorState, PageHeader, SourceBadge, Skeleton, Stat, StatGrid } from '@/components/ui/Feedback'
import { Tabs } from '@/components/ui/Tabs'
import { useMyRewards, type RewardsResponse } from '@/lib/api/ecosystem'
import { formatUsdc, ordinal } from '@/lib/money'
import { formatDate } from '@/lib/time'

type Tab = 'received' | 'funded' | 'claimable'
type Received = RewardsResponse['received'][number]
type Funded = RewardsResponse['funded'][number]
type Claimable = RewardsResponse['claimable'][number]

const bountyCell = (id: number, title: string) => (
  <Link to={`/bounty/${id}`} className="hover:underline">
    {title}
  </Link>
)

function Content() {
  const [tab, setTab] = useState<Tab>('received')
  const query = useMyRewards(true)

  if (query.isError) return <ErrorState title="Your rewards did not load" onRetry={() => void query.refetch()} />
  if (query.isPending) return <Skeleton className="h-40 w-full" />
  const { received, claimable, funded } = query.data

  const net = received.reduce((sum, r) => sum + BigInt(r.net), 0n)
  const fees = received.reduce((sum, r) => sum + BigInt(r.fee), 0n)
  const claimableTotal = claimable.reduce((sum, r) => sum + BigInt(r.gross), 0n)
  const escrowed = funded.filter((f) => f.kind === 'funded').reduce((sum, f) => sum + BigInt(f.amount), 0n)
  const refunded = funded.filter((f) => f.kind === 'refunded').reduce((sum, f) => sum + BigInt(f.amount), 0n)

  const receivedColumns: Column<Received>[] = [
    { header: 'When', cell: (r) => <span className="whitespace-nowrap text-mute">{formatDate(r.time)}</span> },
    { header: 'Bounty', cell: (r) => bountyCell(r.onchainId, r.bountyTitle) },
    { header: 'Place', cell: (r) => <span className="num">{ordinal(r.position)}</span> },
    { header: 'Prize', align: 'right', cell: (r) => <span className="num">{formatUsdc(r.gross, 4)}</span> },
    { header: '5% fee', align: 'right', cell: (r) => <span className="num text-mute">-{formatUsdc(r.fee, 4)}</span> },
    { header: 'Received', align: 'right', cell: (r) => <span className="num font-semibold">{formatUsdc(r.net, 4)} USDC</span> },
    { header: 'Transaction', cell: (r) => <TxLink hash={r.txHash} /> },
  ]
  const fundedColumns: Column<Funded>[] = [
    { header: 'When', cell: (r) => <span className="whitespace-nowrap text-mute">{formatDate(r.time)}</span> },
    { header: 'Bounty', cell: (r) => bountyCell(r.onchainId, r.bountyTitle) },
    { header: 'Type', cell: (r) => (r.kind === 'funded' ? 'Funded escrow' : 'Prize taken back') },
    { header: 'Amount', align: 'right', cell: (r) => <span className="num font-semibold">{formatUsdc(r.amount, 4)} USDC</span> },
    { header: '0.5% fee', align: 'right', cell: (r) => <span className="num text-mute">{r.kind === 'funded' ? formatUsdc(r.fee, 4) : '-'}</span> },
    { header: 'Transaction', cell: (r) => <TxLink hash={r.txHash} /> },
  ]
  const claimableColumns: Column<Claimable>[] = [
    { header: 'Bounty', cell: (r) => bountyCell(r.onchainId, r.bountyTitle) },
    { header: 'Place', cell: (r) => <span className="num">{ordinal(r.position)}</span> },
    { header: 'Picked', cell: (r) => <span className="text-mute">{formatDate(r.approvedAt)}</span> },
    { header: 'Prize before fee', align: 'right', cell: (r) => <span className="num font-semibold">{formatUsdc(r.gross, 4)} USDC</span> },
    { header: '', cell: (r) => <Link to={`/bounty/${r.onchainId}`} className="text-sm font-medium underline underline-offset-2">Claim</Link> },
  ]

  return (
    <div className="space-y-6">
      <StatGrid>
        <Stat label="Received after fees" value={formatUsdc(net, 4)} unit="USDC" hint={<SourceBadge source="chain" />} />
        <Stat label="Claim fees paid" value={formatUsdc(fees, 4)} unit="USDC" />
        <Stat label="Ready to claim" value={formatUsdc(claimableTotal, 4)} unit="USDC" hint={claimable.length > 0 ? `${claimable.length} ${claimable.length === 1 ? 'prize' : 'prizes'}` : undefined} />
        <Stat label="Funded into escrow" value={formatUsdc(escrowed, 4)} unit="USDC" hint={refunded > 0n ? `${formatUsdc(refunded, 4)} taken back` : undefined} />
      </StatGrid>

      <Tabs
        label="Reward history"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'received', label: 'Received', count: received.length },
          { value: 'claimable', label: 'Ready to claim', count: claimable.length },
          { value: 'funded', label: 'Funded and refunded', count: funded.length },
        ]}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-3">
        <p className="text-xs text-mute">Every row is read from contract events on Arc, so it can be checked on the explorer.</p>
        {tab === 'received' && (
          <DataTable caption="Received rewards" columns={receivedColumns} rows={received} rowKey={(r) => r.id} loading={false} error={false} onRetry={() => undefined} emptyTitle="No rewards received yet" emptyHint="When you claim a prize it is listed here with its transaction." />
        )}
        {tab === 'claimable' && (
          <DataTable caption="Prizes ready to claim" columns={claimableColumns} rows={claimable} rowKey={(r) => `${r.onchainId}-${r.position}`} loading={false} error={false} onRetry={() => undefined} emptyTitle="Nothing to claim" emptyHint="Prizes appear here once a creator picks you as a winner." />
        )}
        {tab === 'funded' && (
          <DataTable caption="Funded and refunded" columns={fundedColumns} rows={funded} rowKey={(r) => r.id} loading={false} error={false} onRetry={() => undefined} emptyTitle="You have not funded a bounty" emptyHint="Funding and refunds of your own bounties are listed here." />
        )}
      </div>
    </div>
  )
}

export default function Rewards() {
  return (
    <div>
      <PageHeader title="Reward history">Prizes you received, prizes waiting for you, and the USDC you put into escrow.</PageHeader>
      <RequireIdentity purpose="see your rewards">
        <Content />
      </RequireIdentity>
    </div>
  )
}

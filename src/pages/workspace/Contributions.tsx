import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GitPullRequest } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { ReviewBadge } from '@/components/ecosystem/badges'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { useIdentity } from '@/contexts/IdentityContext'
import { useMyMilestoneSubmissions } from '@/lib/api/ecosystem'
import { useMySubmissions } from '@/lib/api/queries'
import { Status } from '@/lib/api/types'
import { formatUsdc, ordinal } from '@/lib/money'
import { timeAgo } from '@/lib/time'

type Tab = 'active' | 'changes' | 'completed'

function Content({ wallet }: { wallet: string }) {
  const [tab, setTab] = useState<Tab>('active')
  const work = useMySubmissions(true)
  const milestones = useMyMilestoneSubmissions(true)

  if (work.isError || milestones.isError) return <ErrorState title="Your contributions did not load" onRetry={() => { void work.refetch(); void milestones.refetch() }} />
  if (work.isPending || milestones.isPending) return <Skeleton className="h-40 w-full" />

  const live = (s: Status) => s === Status.Funded || s === Status.Approved
  const bounty = work.data
  const ms = milestones.data

  const claimable = (w: (typeof bounty)[number]) => {
    const idx = w.winners.indexOf(wallet)
    return w.status === 'winner' && w.bountyStatus === Status.Approved && idx >= 0 && !w.winnersClaimed[idx]
  }
  const done = (w: (typeof bounty)[number]) => !live(w.bountyStatus) || (w.position !== null && w.winnersClaimed[w.winners.indexOf(wallet)] === true)

  const active = bounty.filter((w) => !done(w) && w.reviewStatus !== 'changes_requested')
  const activeMs = ms.filter((m) => live(m.bountyStatus) && m.reviewStatus !== 'changes_requested')
  const changes = bounty.filter((w) => live(w.bountyStatus) && w.reviewStatus === 'changes_requested')
  const changesMs = ms.filter((m) => live(m.bountyStatus) && m.reviewStatus === 'changes_requested')
  const completed = bounty.filter(done)
  const completedMs = ms.filter((m) => !live(m.bountyStatus) || m.approved)

  const count = (a: unknown[], b: unknown[]) => a.length + b.length

  const Row = ({ to, title, badges, note, right }: { to: string; title: string; badges: React.ReactNode; note: string; right?: string }) => (
    <li>
      <Link to={to} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.02]">
        <span className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-2">{badges}</span>
          <span className="block truncate font-display font-semibold">{title}</span>
          <span className="block text-xs text-mute">{note}</span>
        </span>
        {right && <span className="num text-sm font-semibold">{right}</span>}
      </Link>
    </li>
  )

  const renderBounty = (w: (typeof bounty)[number]) => (
    <Row
      key={`b-${w.id}`}
      to={`/bounty/${w.onchainId}?tab=submissions`}
      title={w.bountyTitle}
      badges={
        <>
          {w.notesVerified ? <ReviewBadge status={w.reviewStatus} /> : <Badge tone="warn">Notes missing</Badge>}
          {w.status === 'winner' && <Badge tone="signal">{w.position ? `${ordinal(w.position)} place` : 'Winner'}</Badge>}
          {claimable(w) && <Badge tone="ok">Ready to claim</Badge>}
          {w.status === 'not_selected' && <Badge>Not selected</Badge>}
        </>
      }
      note={`Submitted ${timeAgo(w.createdAt)}`}
      right={w.position ? `${formatUsdc(w.prizePayouts[w.position - 1] ?? '0')} USDC` : `${formatUsdc(w.rewardAmount)} USDC pool`}
    />
  )
  const renderMs = (m: (typeof ms)[number]) => (
    <Row
      key={`m-${m.id}`}
      to={`/bounty/${m.onchainId}?tab=milestones`}
      title={`${m.bountyTitle}: ${m.milestoneTitle}`}
      badges={
        <>
          <ReviewBadge status={m.reviewStatus} />
          <Badge>Milestone</Badge>
        </>
      }
      note={`Submitted ${timeAgo(m.createdAt)}`}
      right={`${formatUsdc(m.plannedReward)} USDC planned`}
    />
  )

  const list = (a: typeof bounty, b: typeof ms, empty: string) =>
    a.length + b.length === 0 ? (
      <EmptyState icon={GitPullRequest} title={empty} action={tab === 'active' ? <ButtonLink to="/explore" variant="primary">Find a bounty</ButtonLink> : undefined} />
    ) : (
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {a.map(renderBounty)}
        {b.map(renderMs)}
      </ul>
    )

  return (
    <div>
      <Tabs
        label="Contributions"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'active', label: 'In progress', count: count(active, activeMs) },
          { value: 'changes', label: 'Changes requested', count: count(changes, changesMs) },
          { value: 'completed', label: 'Completed', count: count(completed, completedMs) },
        ]}
      />
      <TabPanel id={tab}>
        {tab === 'active' && list(active, activeMs, 'No work in progress')}
        {tab === 'changes' && list(changes, changesMs, 'No requested changes')}
        {tab === 'completed' && list(completed, completedMs, 'Nothing completed yet')}
      </TabPanel>
    </div>
  )
}

export default function Contributions() {
  const id = useIdentity()
  return (
    <div>
      <PageHeader title="My contributions">Every bounty and milestone you have worked on, by stage.</PageHeader>
      <RequireIdentity purpose="see your contributions">{id.address && <Content wallet={id.address.toLowerCase()} />}</RequireIdentity>
    </div>
  )
}

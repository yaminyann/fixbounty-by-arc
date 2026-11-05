import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Github, Globe, Settings2 } from 'lucide-react'
import { BountyRow, BountyRowSkeleton } from '@/components/bounty/BountyRow'
import { ActivityList } from '@/components/ecosystem/ActivityList'
import { CADENCE_LABEL, ProjectAvatar } from '@/components/ecosystem/badges'
import { AddressChip, Avatar, TxLink } from '@/components/ui/Address'
import { ButtonLink, ExternalLink } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, EmptyState, ErrorState, Section, Skeleton, SourceBadge, Stat, StatGrid } from '@/components/ui/Feedback'
import { Segmented, Tabs } from '@/components/ui/Tabs'
import { useBounties } from '@/lib/api/queries'
import {
  useProject,
  useProjectActivity,
  useProjectContributors,
  useProjectRewards,
  useRecurringPrograms,
  type ProjectContributor,
  type ProjectReward,
} from '@/lib/api/ecosystem'
import { ApiError } from '@/lib/api/client'
import { formatUsdc, ordinal } from '@/lib/money'
import { formatDate, timeAgo } from '@/lib/time'

type Tab = 'overview' | 'bounties' | 'contributors' | 'rewards' | 'recurring' | 'activity'
const TABS: Tab[] = ['overview', 'bounties', 'contributors', 'rewards', 'recurring', 'activity']

function BountyList({ slug, state, limit = 10 }: { slug: string; state?: 'open' | 'in_progress' | 'completed'; limit?: number }) {
  const query = useBounties({ project: slug, state, limit, sort: state === 'completed' ? 'newest' : 'deadline' })
  if (query.isPending)
    return (
      <ul className="overflow-hidden rounded-lg border border-line">
        <BountyRowSkeleton />
        <BountyRowSkeleton />
      </ul>
    )
  if (query.isError) return <ErrorState title="Bounties did not load" onRetry={() => void query.refetch()} />
  if (query.data.items.length === 0) return <EmptyState title="Nothing here">There are no bounties in this state.</EmptyState>
  return (
    <ul className="overflow-hidden rounded-lg border border-line bg-surface">
      {query.data.items.map((b) => (
        <BountyRow key={b.id} bounty={b} />
      ))}
    </ul>
  )
}

function BountiesTab({ slug }: { slug: string }) {
  const [state, setState] = useState<'open' | 'in_progress' | 'completed'>('open')
  return (
    <div className="space-y-4">
      <Segmented
        label="Bounty state"
        value={state}
        onChange={setState}
        items={[
          { value: 'open', label: 'Open' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'completed', label: 'Completed' },
        ]}
      />
      <BountyList slug={slug} state={state} />
    </div>
  )
}

function ContributorsTab({ slug }: { slug: string }) {
  const [offset, setOffset] = useState(0)
  const query = useProjectContributors(slug, { limit: 20, offset })
  const columns: Column<ProjectContributor>[] = [
    {
      header: 'Contributor',
      cell: (c) => (
        <Link to={`/u/${c.wallet}`} className="flex items-center gap-2.5 hover:underline">
          <Avatar name={c.name ?? c.wallet} src={c.photo} size={26} />
          <span className="min-w-0">
            {c.name && <span className="block truncate font-medium">{c.name}</span>}
            <span className="num block text-xs text-mute">{c.wallet.slice(0, 6)}…{c.wallet.slice(-4)}</span>
          </span>
        </Link>
      ),
    },
    { header: 'Submissions', cell: (c) => <span className="num">{c.submissions}</span> },
    { header: 'Wins', cell: (c) => <span className="num">{c.wins}</span> },
    { header: 'Status', cell: (c) => (c.active ? <Badge tone="ok">Active now</Badge> : <span className="text-mute">Past</span>) },
    { header: 'Earned', align: 'right', cell: (c) => <span className="num font-medium">{formatUsdc(c.earned)} USDC</span> },
  ]
  return (
    <div className="space-y-3">
      <SourceBadge source="chain" />
      <DataTable
        caption="Contributors"
        columns={columns}
        rows={query.data?.items}
        rowKey={(c) => c.wallet}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No contributors yet"
        emptyHint="People who submit work to this project's bounties appear here. Earnings are read from claim events."
        page={query.data ? { total: query.data.total, limit: 20, offset, onChange: setOffset } : undefined}
        dimmed={query.isPlaceholderData}
      />
    </div>
  )
}

function RewardsTab({ slug }: { slug: string }) {
  const [offset, setOffset] = useState(0)
  const query = useProjectRewards(slug, { limit: 20, offset })
  const columns: Column<ProjectReward>[] = [
    { header: 'When', cell: (r) => <span className="whitespace-nowrap text-mute">{formatDate(r.time)}</span> },
    {
      header: 'Bounty',
      cell: (r) => (
        <Link to={`/bounty/${r.onchainId}`} className="hover:underline">
          {r.bountyTitle}
        </Link>
      ),
    },
    { header: 'Place', cell: (r) => <span className="num">{ordinal(r.position)}</span> },
    {
      header: 'Winner',
      cell: (r) => (
        <Link to={`/u/${r.wallet}`} className="num text-xs hover:underline">
          {r.wallet.slice(0, 6)}…{r.wallet.slice(-4)}
        </Link>
      ),
    },
    { header: 'Received', align: 'right', cell: (r) => <span className="num font-medium">{formatUsdc(r.net, 4)} USDC</span> },
    { header: 'Transaction', cell: (r) => <TxLink hash={r.txHash} /> },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source="chain" />
        <p className="text-xs text-mute">Amounts after the 5% claim fee. Each row is a RewardClaimed event.</p>
      </div>
      <DataTable
        caption="Reward distribution history"
        columns={columns}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No rewards distributed yet"
        emptyHint="Claimed prizes show up here with their transaction."
        page={query.data ? { total: query.data.total, limit: 20, offset, onChange: setOffset } : undefined}
        dimmed={query.isPlaceholderData}
      />
    </div>
  )
}

function RecurringTab({ slug }: { slug: string }) {
  const query = useRecurringPrograms(slug)
  if (query.isPending) return <Skeleton className="h-28 w-full" />
  if (query.isError) return <ErrorState title="Programs did not load" onRetry={() => void query.refetch()} />
  if (query.data.length === 0) return <EmptyState title="No recurring programs">This project has not set up regular work yet.</EmptyState>
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {query.data.map((p) => (
        <li key={p.id} className="space-y-1.5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display font-semibold">{p.title}</p>
            <div className="flex items-center gap-2">
              <Badge>{CADENCE_LABEL[p.cadence]}</Badge>
              {!p.active && <Badge tone="warn">Paused</Badge>}
            </div>
          </div>
          {p.description && <p className="text-sm text-mute">{p.description}</p>}
          <p className="text-xs text-mute">
            <span className="num font-medium text-ink">{formatUsdc(p.rewardPerCycle)} USDC</span> per cycle · {p.cycleCount} {p.cycleCount === 1 ? 'cycle' : 'cycles'} published
            {p.lastBountyId && (
              <>
                {' '}
                ·{' '}
                <Link className="underline underline-offset-2" to={`/bounty/${p.lastBountyId}`}>
                  latest bounty
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
      <li className="bg-paper px-4 py-2.5 text-xs text-mute">Each cycle is a normal bounty with its own on-chain escrow. BountyFi does not move funds automatically.</li>
    </ul>
  )
}

function ActivityTab({ slug }: { slug: string }) {
  const [offset, setOffset] = useState(0)
  const query = useProjectActivity(slug, { limit: 20, offset })
  if (query.isPending) return <Skeleton className="h-40 w-full" />
  if (query.isError) return <ErrorState title="Activity did not load" onRetry={() => void query.refetch()} />
  return (
    <div className="space-y-3">
      <SourceBadge source="chain" />
      <ActivityList items={query.data.items} />
      {query.data.total > 20 && (
        <div className="flex justify-between text-sm">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - 20, 0))} className="font-medium text-mute hover:text-ink disabled:opacity-40">
            Newer
          </button>
          <button type="button" disabled={offset + 20 >= query.data.total} onClick={() => setOffset(offset + 20)} className="font-medium text-mute hover:text-ink disabled:opacity-40">
            Older
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProjectPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t === params.get('tab')) ?? 'overview') as Tab
  const query = useProject(slug)

  if (query.isPending)
    return (
      <div aria-busy className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState title="This project is not available" action={<ButtonLink to="/projects" variant="primary">Browse projects</ButtonLink>}>
          It may not exist, or it was hidden by an admin.
        </EmptyState>
      )
    }
    return <ErrorState title="The project did not load" onRetry={() => void query.refetch()} />
  }

  const { project, isOwner } = query.data

  return (
    <article className="space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-mute hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> All projects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ProjectAvatar name={project.name} logoUrl={project.logoUrl} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold sm:text-3xl">{project.name}</h1>
              {project.status === 'hidden' && <Badge tone="warn">Hidden by an admin</Badge>}
            </div>
            {project.tagline && <p className="mt-1 text-mute">{project.tagline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
              {project.websiteUrl && (
                <span className="inline-flex items-center gap-1">
                  <Globe size={14} aria-hidden />
                  <ExternalLink href={project.websiteUrl}>{new URL(project.websiteUrl).hostname}</ExternalLink>
                </span>
              )}
              {project.githubUrl && (
                <span className="inline-flex items-center gap-1">
                  <Github size={14} aria-hidden />
                  <ExternalLink href={project.githubUrl}>GitHub</ExternalLink>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                Owner <AddressChip address={project.ownerWallet} />
              </span>
            </div>
          </div>
        </div>
        {isOwner && (
          <ButtonLink to={`/workspace/projects/${project.slug}`} icon={<Settings2 size={15} aria-hidden />}>
            Manage project
          </ButtonLink>
        )}
      </header>

      <div className="space-y-2">
        <StatGrid columns={4}>
          <Stat label="Open now" value={project.openCount} />
          <Stat label="Bounties listed" value={project.bountyCount} hint={`${project.completedCount} completed`} />
          <Stat label="Funded on-chain" value={formatUsdc(project.fundedAmount)} unit="USDC" hint={<SourceBadge source="chain" />} />
          <Stat label="Paid to contributors" value={formatUsdc(project.distributedAmount)} unit="USDC" hint={<SourceBadge source="chain" />} />
        </StatGrid>
        <p className="text-xs text-mute">
          Figures marked verified come from contract events on Arc. Descriptions, milestones and reviews are recorded on BountyFi and are not on the blockchain.
        </p>
      </div>

      <Tabs
        label="Project sections"
        value={tab}
        onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'bounties', label: 'Bounties', count: project.bountyCount },
          { value: 'contributors', label: 'Contributors', count: project.contributorCount },
          { value: 'rewards', label: 'Rewards' },
          { value: 'recurring', label: 'Recurring' },
          { value: 'activity', label: 'Activity' },
        ]}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <div className="space-y-8">
            {project.description && (
              <Section title="About">
                <p className="prose-plain">{project.description}</p>
              </Section>
            )}
            <Section title="Active opportunities" actions={<Link className="text-sm font-medium underline underline-offset-2" to={`/projects/${project.slug}?tab=bounties`}>See all</Link>}>
              <BountyList slug={project.slug} state="open" limit={5} />
            </Section>
            <Section title="Recently completed">
              <BountyList slug={project.slug} state="completed" limit={3} />
            </Section>
            <p className="text-xs text-mute">Listed {timeAgo(project.createdAt)}.</p>
          </div>
        )}
        {tab === 'bounties' && <BountiesTab slug={project.slug} />}
        {tab === 'contributors' && <ContributorsTab slug={project.slug} />}
        {tab === 'rewards' && <RewardsTab slug={project.slug} />}
        {tab === 'recurring' && <RecurringTab slug={project.slug} />}
        {tab === 'activity' && <ActivityTab slug={project.slug} />}
      </div>
    </article>
  )
}

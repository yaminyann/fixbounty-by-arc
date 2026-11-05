import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { BountyRow, BountyRowSkeleton } from '@/components/bounty/BountyRow'
import { StatusBadge } from '@/components/bounty/StatusBadge'
import { Badge, EmptyState, ErrorState, PageHeader, Section, Skeleton } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { useMyTeams } from '@/lib/api/ecosystem'
import { useBounties } from '@/lib/api/queries'
import { formatUsdc } from '@/lib/money'

const pct = (bps: number | null) => (bps === null ? 'Share not set' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}% share`)

function Progress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-xs text-mute">No milestones</span>
  return (
    <span className="flex items-center gap-2 text-xs text-mute">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${(done / total) * 100}%` }} />
      </span>
      {done} of {total} milestones
    </span>
  )
}

function Content() {
  const teams = useMyTeams(true)
  const open = useBounties({ mode: 'team', state: 'open', sort: 'newest', limit: 5 })

  return (
    <div className="space-y-9">
      <Section title="Teams I belong to">
        {teams.isError ? (
          <ErrorState title="Your teams did not load" onRetry={() => void teams.refetch()} />
        ) : teams.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : teams.data.memberships.length === 0 ? (
          <EmptyState icon={Users} title="You are not on a team yet">
            Ask to join one of the team bounties below. The creator decides who joins and what each person owns.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {teams.data.memberships.map((m) => (
              <li key={m.id}>
                <Link to={`/bounty/${m.onchainId}?tab=team`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.02]">
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {m.status === 'requested' ? <Badge tone="warn">Request pending</Badge> : <Badge tone="ok">Member</Badge>}
                      <StatusBadge status={m.bountyStatus} deadline={m.deadline} />
                    </span>
                    <span className="block truncate font-display font-semibold">{m.bountyTitle}</span>
                    <span className="block text-xs text-mute">
                      {m.role || 'Role not assigned'} · {m.memberCount} {m.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    <Progress done={m.milestonesApproved} total={m.milestonesTotal} />
                  </span>
                  <span className="text-right text-sm">
                    <span className="num block font-semibold">{formatUsdc(m.rewardAmount)} USDC pool</span>
                    {m.status === 'active' && <span className="text-xs text-mute">{pct(m.shareBps)} (agreed off-chain)</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {teams.data && teams.data.led.length > 0 && (
        <Section title="Teams I lead" description="Team bounties you created.">
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {teams.data.led.map((t) => (
              <li key={t.onchainId}>
                <Link to={`/bounty/${t.onchainId}?tab=team`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.02]">
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={t.bountyStatus} deadline={t.deadline} />
                      {t.requestCount > 0 && <Badge tone="warn">{t.requestCount} {t.requestCount === 1 ? 'request' : 'requests'}</Badge>}
                    </span>
                    <span className="block truncate font-display font-semibold">{t.bountyTitle}</span>
                    <Progress done={t.milestonesApproved} total={t.milestonesTotal} />
                  </span>
                  <span className="text-right text-sm">
                    <span className="num block font-semibold">{t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}</span>
                    <span className="text-xs text-mute">{formatUsdc(t.rewardAmount)} USDC pool</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Open team bounties"
        actions={
          <Link to="/explore?mode=team" className="text-sm font-medium underline underline-offset-2">
            See all
          </Link>
        }
      >
        {open.isPending ? (
          <ul className="overflow-hidden rounded-lg border border-line">
            <BountyRowSkeleton />
          </ul>
        ) : open.data && open.data.items.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border border-line bg-surface">
            {open.data.items.map((b) => (
              <BountyRow key={b.id} bounty={b} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No team bounties are open">Post one and set the work type to Team bounty.</EmptyState>
        )}
      </Section>
    </div>
  )
}

export default function Teams() {
  return (
    <div>
      <PageHeader
        title="Team bounties"
        actions={
          <ButtonLink to="/create" variant="primary">
            Post a team bounty
          </ButtonLink>
        }
      >
        Work together on larger bounties. Roles and shares are agreed off-chain; the contract pays one wallet per prize place.
      </PageHeader>
      <RequireIdentity purpose="see your teams">
        <Content />
      </RequireIdentity>
    </div>
  )
}

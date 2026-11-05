import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { BountyRow, BountyRowSkeleton } from '@/components/bounty/BountyRow'
import { ActivityList } from '@/components/ecosystem/ActivityList'
import { ButtonLink } from '@/components/ui/Button'
import { Callout, ErrorState, PageHeader, Section, Skeleton, Stat, StatGrid } from '@/components/ui/Feedback'
import { useWorkspace } from '@/lib/api/ecosystem'
import { useBounties } from '@/lib/api/queries'
import { formatUsdc, ordinal } from '@/lib/money'
import { timeAgo } from '@/lib/time'

function Content() {
  const workspace = useWorkspace(true)
  const open = useBounties({ state: 'open', sort: 'newest', limit: 3 })

  if (workspace.isError) return <ErrorState title="Your dashboard did not load" onRetry={() => void workspace.refetch()} />
  if (workspace.isPending) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  const c = workspace.data.contributor

  return (
    <div className="space-y-8">
      <StatGrid>
        <Stat label="Active contributions" value={c.active} hint={c.pendingReview > 0 ? `${c.pendingReview} waiting for review` : 'Nothing waiting'} />
        <Stat label="Pending reviews" value={c.pendingReview} />
        <Stat label="Completed bounties" value={c.completed} hint={c.won > c.completed ? `${c.won} won in total` : undefined} />
        <Stat label="Earned after fees" value={formatUsdc(c.earned, 4)} unit="USDC" />
      </StatGrid>

      {c.changesRequested > 0 && (
        <Callout
          tone="warn"
          title={`${c.changesRequested} ${c.changesRequested === 1 ? 'submission needs' : 'submissions need'} changes`}
          action={
            <ButtonLink to="/workspace/contributions" size="sm" variant="primary">
              See requested changes
            </ButtonLink>
          }
        >
          A reviewer asked for updates. Reply in the review thread to put your work back in the queue.
        </Callout>
      )}

      {c.claimable.length > 0 && (
        <Section title="Ready to claim" description="Winners picked on-chain. Claim each prize from the bounty page.">
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {c.claimable.map((p) => (
              <li key={`${p.onchainId}-${p.position}`}>
                <Link to={`/bounty/${p.onchainId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.02]">
                  <span className="min-w-0">
                    <span className="block truncate font-display font-semibold">{p.title}</span>
                    <span className="text-xs text-mute">
                      {ordinal(p.position)} place · picked {timeAgo(p.approvedAt)}
                    </span>
                  </span>
                  <span className="num text-sm font-semibold">{formatUsdc(p.gross)} USDC</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Available opportunities"
        description={c.available > 0 ? `${c.available} open ${c.available === 1 ? 'bounty' : 'bounties'} you have not submitted to.` : undefined}
        actions={
          <Link to="/explore" className="text-sm font-medium underline underline-offset-2">
            Explore all
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
          <p className="text-sm text-mute">No bounties are open right now.</p>
        )}
      </Section>

      <Section title="Recent activity" description="Your latest contract events.">
        <ActivityList items={c.recent} empty="Your submissions, wins and claims appear here after they are confirmed on-chain." />
      </Section>
    </div>
  )
}

export default function ContributorDashboard() {
  return (
    <div>
      <PageHeader
        title="Contributor dashboard"
        actions={
          <ButtonLink to="/explore" icon={<Compass size={15} aria-hidden />}>
            Find work
          </ButtonLink>
        }
      >
        Your active work, reviews and earnings.
      </PageHeader>
      <RequireIdentity purpose="see your dashboard">
        <Content />
      </RequireIdentity>
    </div>
  )
}

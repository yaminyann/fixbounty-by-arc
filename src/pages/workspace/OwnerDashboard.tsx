import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { ActivityList } from '@/components/ecosystem/ActivityList'
import { ReviewBadge } from '@/components/ecosystem/badges'
import { ButtonLink } from '@/components/ui/Button'
import { Callout, EmptyState, ErrorState, PageHeader, Section, Skeleton, Stat, StatGrid } from '@/components/ui/Feedback'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { useIdentity } from '@/contexts/IdentityContext'
import { useReviewQueue, useWorkspace } from '@/lib/api/ecosystem'
import { useMyBounties } from '@/lib/api/queries'
import { Status } from '@/lib/api/types'
import { bountyDraftKey, listDrafts } from '@/lib/drafts'
import { formatUsdc, shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'

type Tab = 'bounties' | 'unfinished' | 'activity'

function Content({ wallet }: { wallet: string }) {
  const [tab, setTab] = useState<Tab>('bounties')
  const workspace = useWorkspace(true)
  const bounties = useMyBounties(true)
  const queue = useReviewQueue(true)
  const drafts = useMemo(() => listDrafts<{ onchainId: number; form: { title: string } }>(bountyDraftKey(wallet, '')), [wallet])

  if (workspace.isError) return <ErrorState title="Your dashboard did not load" onRetry={() => void workspace.refetch()} />
  if (workspace.isPending) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const o = workspace.data.owner
  const toReview = o.submissionsToReview + o.milestonesToReview
  const pending = (queue.data ?? []).filter((i) => i.reviewStatus === 'submitted' && [1, 2].includes(i.bountyStatus)).slice(0, 5)
  const unpublished = (bounties.data ?? []).filter((b) => !b.metadataVerified || b.status === Status.Open)

  return (
    <div className="space-y-8">
      <StatGrid>
        <Stat label="Open for work" value={o.open} hint={`${o.total} bounties in total`} />
        <Stat label="Pending reviews" value={toReview} tone={toReview > 0 ? 'warn' : undefined} hint={o.waitingOnContributors > 0 ? `${o.waitingOnContributors} waiting on contributors` : undefined} />
        <Stat label="Funded rewards" value={formatUsdc(o.funded)} unit="USDC" hint={`${formatUsdc(o.escrowed)} still in escrow`} />
        <Stat label="Distributed rewards" value={formatUsdc(o.distributed, 4)} unit="USDC" hint="Paid to winners after fees" />
      </StatGrid>
      <StatGrid>
        <Stat label="Projects" value={o.projects} />
        <Stat label="Active contributors" value={o.activeContributors} />
        <Stat label="Awaiting admin approval" value={o.awaitingApproval} />
        <Stat label="Team requests" value={o.teamRequests} />
      </StatGrid>

      {o.unfunded > 0 && (
        <Callout tone="warn" title={`${o.unfunded} ${o.unfunded === 1 ? 'bounty is' : 'bounties are'} created but not funded`}>
          Funding locks the prize in the contract. Finish them under the Unfinished tab.
        </Callout>
      )}

      <Section
        title="Needs your review"
        description={toReview > 0 ? `${toReview} ${toReview === 1 ? 'submission is' : 'submissions are'} waiting for a decision.` : undefined}
        actions={
          <Link className="text-sm font-medium underline underline-offset-2" to="/submissions?tab=review">
            All submissions
          </Link>
        }
      >
        {queue.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : pending.length === 0 ? (
          <p className="text-sm text-mute">Nothing is waiting. New submissions to your bounties appear here.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {pending.map((i) => (
              <li key={`${i.type}-${i.id}`}>
                <Link
                  to={`/bounty/${i.onchainId}?tab=${i.type === 'milestone_submission' ? 'milestones' : 'submissions'}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.02]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.milestoneTitle ? `${i.bountyTitle}: ${i.milestoneTitle}` : i.bountyTitle}</span>
                    <span className="text-xs text-mute">
                      {i.submitterName ?? shortAddress(i.submitterWallet)} · {timeAgo(i.createdAt)}
                    </span>
                  </span>
                  <ReviewBadge status={i.reviewStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div>
        <Tabs
          label="Your bounties"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'bounties', label: 'Published bounties', count: bounties.data?.length },
            { value: 'unfinished', label: 'Unfinished', count: unpublished.length + drafts.length || undefined },
            { value: 'activity', label: 'Contributor activity' },
          ]}
        />

        {tab === 'bounties' && (
          <TabPanel id="bounties">
            {bounties.isError ? (
              <ErrorState title="Your bounties did not load" onRetry={() => void bounties.refetch()} />
            ) : bounties.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : bounties.data.length === 0 ? (
              <EmptyState title="You have not posted a bounty" action={<ButtonLink to="/create" variant="primary">Post a bounty</ButtonLink>}>
                Bounties you create show up here with their review status, even before they are public.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {bounties.data.map((b) => (
                  <li key={b.id}>
                    <Link to={`/bounty/${b.onchainId}`} className="grid gap-2 px-4 py-4 hover:bg-ink/[0.02] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={b.status} deadline={b.deadline} />
                          <ModerationBadge status={b.moderationStatus} />
                          <span className="num text-xs text-mute">#{b.onchainId}</span>
                        </div>
                        <p className="truncate font-display font-semibold">{b.title}</p>
                        {b.moderationStatus === 'rejected' && b.moderationNote && <p className="text-sm text-danger">Admin note: {b.moderationNote}</p>}
                      </div>
                      <div className="text-sm sm:text-right">
                        <p className="num font-semibold">{formatUsdc(b.rewardAmount)} USDC</p>
                        <p className="text-xs text-mute">
                          {b.submissionCount} {b.submissionCount === 1 ? 'submission' : 'submissions'}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>
        )}

        {tab === 'unfinished' && (
          <TabPanel id="unfinished">
            {unpublished.length === 0 && drafts.length === 0 ? (
              <EmptyState title="Nothing is waiting for you">Bounties that were created but not published or funded would appear here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {[
                  ...drafts.map((d) => ({ id: d.value.onchainId, title: d.value.form.title, note: 'Continue where you stopped' })),
                  ...unpublished
                    .filter((b) => !drafts.some((d) => d.value.onchainId === b.onchainId))
                    .map((b) => ({ id: b.onchainId, title: b.title, note: b.metadataVerified ? 'Created but not funded' : 'Created on-chain, description not published' })),
                ].map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <p className="font-display font-semibold">{item.title || `Bounty #${item.id}`}</p>
                      <p className="text-sm text-mute">{item.note}</p>
                    </div>
                    <ButtonLink to={`/create?resume=${item.id}`} variant="primary" size="sm">
                      Continue
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>
        )}

        {tab === 'activity' && (
          <TabPanel id="activity">
            <ActivityList items={o.recent} empty="Submissions, winners and claims on your bounties appear here after they are confirmed on-chain." />
          </TabPanel>
        )}
      </div>
    </div>
  )
}

export default function OwnerDashboard() {
  const id = useIdentity()
  return (
    <div>
      <PageHeader
        title="Project dashboard"
        actions={
          <>
            <ButtonLink to="/workspace/projects">My projects</ButtonLink>
            <ButtonLink to="/create" variant="accent" icon={<Plus size={15} aria-hidden />}>
              Post a bounty
            </ButtonLink>
          </>
        }
      >
        Your bounties, pending reviews and the rewards you funded and distributed.
      </PageHeader>
      <RequireIdentity purpose="see your project dashboard">{id.address && <Content wallet={id.address.toLowerCase()} />}</RequireIdentity>
    </div>
  )
}

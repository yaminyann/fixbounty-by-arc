import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { useIdentity } from '@/contexts/IdentityContext'
import { useMyBounties, useMySubmissions, useMySummary } from '@/lib/api/queries'
import { Status } from '@/lib/api/types'
import { bountyDraftKey, listDrafts } from '@/lib/drafts'
import { formatUsdc, ordinal } from '@/lib/money'
import { timeAgo } from '@/lib/time'

type Tab = 'bounties' | 'work' | 'unfinished'

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="num font-display text-2xl font-bold">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-mute">{unit}</span>}
      </p>
      <p className="text-xs text-mute">{label}</p>
    </div>
  )
}

function Rows({ loading, error, onRetry, empty, children }: { loading: boolean; error: boolean; onRetry: () => void; empty: React.ReactNode; children: React.ReactNode }) {
  if (error) return <ErrorState title="This did not load" onRetry={onRetry} />
  if (loading) {
    return (
      <div className="space-y-px" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }
  return <>{children ?? empty}</>
}

function Content({ wallet }: { wallet: string }) {
  const [tab, setTab] = useState<Tab>('bounties')
  const summary = useMySummary(true)
  const bounties = useMyBounties(true)
  const work = useMySubmissions(true)

  const drafts = useMemo(
    () => listDrafts<{ onchainId: number; form: { title: string } }>(bountyDraftKey(wallet, '')),
    [wallet],
  )
  const unpublished = (bounties.data ?? []).filter((b) => !b.metadataVerified || b.status === Status.Open)

  const s = summary.data

  return (
    <div className="space-y-8">
      {s && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
          <Tile label="USDC held in your open bounties" value={formatUsdc(s.created.escrowed)} />
          <Tile label="Bounties live" value={String(s.created.live)} />
          <Tile label="Bounties waiting for admin approval" value={String(s.created.pending)} />
          <Tile label="Earned after fees" value={formatUsdc(s.earned, 4)} unit="USDC" />
          <Tile label="Submissions sent" value={String(s.work.submitted)} />
          <Tile label="Prizes won" value={String(s.work.won)} />
          <Tile label="Bounties posted" value={String(s.created.total)} />
          <Tile label="Platform fees paid" value={formatUsdc(s.feesPaid, 4)} unit="USDC" />
        </div>
      )}

      <div>
        <Tabs
          label="Your activity"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'bounties', label: 'My bounties', count: bounties.data?.length },
            { value: 'work', label: 'My submissions', count: work.data?.length },
            { value: 'unfinished', label: 'Unfinished', count: unpublished.length + drafts.length || undefined },
          ]}
        />

        {tab === 'bounties' && (
          <TabPanel id="bounties">
            <Rows
              loading={bounties.isPending}
              error={bounties.isError}
              onRetry={() => void bounties.refetch()}
              empty={null}
            >
              {bounties.data && bounties.data.length === 0 ? (
                <EmptyState title="You have not posted a bounty" action={<ButtonLink to="/create" variant="primary">Post a bounty</ButtonLink>}>
                  Bounties you create show up here with their review status, even before they are public.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                  {bounties.data?.map((b) => (
                    <li key={b.id}>
                      <Link to={`/bounty/${b.onchainId}`} className="grid gap-2 px-4 py-4 hover:bg-signal-soft/50 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={b.status} deadline={b.deadline} />
                            <ModerationBadge status={b.moderationStatus} />
                            <span className="num text-xs text-mute">#{b.onchainId}</span>
                          </div>
                          <p className="truncate font-display font-bold">{b.title}</p>
                          {b.moderationStatus === 'rejected' && b.moderationNote && <p className="text-sm text-danger">Admin note: {b.moderationNote}</p>}
                        </div>
                        <div className="text-sm sm:text-right">
                          <p className="num font-bold">{formatUsdc(b.rewardAmount)} USDC</p>
                          <p className="text-xs text-mute">{b.submissionCount} {b.submissionCount === 1 ? 'submission' : 'submissions'}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Rows>
          </TabPanel>
        )}

        {tab === 'work' && (
          <TabPanel id="work">
            <Rows loading={work.isPending} error={work.isError} onRetry={() => void work.refetch()} empty={null}>
              {work.data && work.data.length === 0 ? (
                <EmptyState title="You have not submitted work yet" action={<ButtonLink to="/explore" variant="primary">Find a bounty</ButtonLink>}>
                  Submissions you send show up here, along with prizes you can claim.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                  {work.data?.map((w) => {
                    const idx = w.winners.indexOf(wallet)
                    const claimable = w.status === 'winner' && w.bountyStatus === Status.Approved && idx >= 0 && !w.winnersClaimed[idx]
                    return (
                      <li key={w.id}>
                        <Link to={`/bounty/${w.onchainId}`} className="grid gap-2 px-4 py-4 hover:bg-signal-soft/50 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {w.status === 'winner' && <Badge tone="signal">{w.position ? `${ordinal(w.position)} place` : 'Winner'}</Badge>}
                              {w.status === 'pending' && <Badge>Under review</Badge>}
                              {w.status === 'not_selected' && <Badge>Not selected</Badge>}
                              {claimable && <Badge tone="ok">Ready to claim</Badge>}
                              {!w.notesVerified && <Badge tone="warn">Notes missing</Badge>}
                            </div>
                            <p className="truncate font-display font-bold">{w.bountyTitle}</p>
                            <p className="text-xs text-mute">Submitted {timeAgo(w.createdAt)}</p>
                          </div>
                          <p className="num text-sm font-bold sm:text-right">
                            {w.position ? `${formatUsdc(w.prizePayouts[w.position - 1] ?? '0')} USDC` : `${formatUsdc(w.rewardAmount)} USDC pool`}
                          </p>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Rows>
          </TabPanel>
        )}

        {tab === 'unfinished' && (
          <TabPanel id="unfinished">
            {unpublished.length === 0 && drafts.length === 0 ? (
              <EmptyState title="Nothing is waiting for you">Bounties that were created but not published or funded would appear here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                {[...drafts.map((d) => ({ id: d.value.onchainId, title: d.value.form.title, note: 'Continue where you stopped' })),
                  ...unpublished
                    .filter((b) => !drafts.some((d) => d.value.onchainId === b.onchainId))
                    .map((b) => ({ id: b.onchainId, title: b.title, note: b.metadataVerified ? 'Created but not funded' : 'Created on-chain, description not published' }))].map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <p className="font-display font-bold">{item.title || `Bounty #${item.id}`}</p>
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
      </div>
    </div>
  )
}

export default function Dashboard() {
  const id = useIdentity()
  return (
    <div>
      <PageHeader title="Dashboard" actions={<ButtonLink to="/create" variant="primary">Post a bounty</ButtonLink>}>
        Your bounties, your submissions and what you have earned.
      </PageHeader>
      <RequireIdentity purpose="see your dashboard">{id.address && <Content wallet={id.address.toLowerCase()} />}</RequireIdentity>
    </div>
  )
}

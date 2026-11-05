import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Users } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { ActivityList } from '@/components/ecosystem/ActivityList'
import { CategoryChip, DifficultyBadge, ProjectAvatar, ReviewBadge } from '@/components/ecosystem/badges'
import { AddressChip, Avatar } from '@/components/ui/Address'
import { Button, ButtonLink, ExternalLink } from '@/components/ui/Button'
import { Badge, Callout, EmptyState, ErrorState, Section, Skeleton } from '@/components/ui/Feedback'
import { Tabs } from '@/components/ui/Tabs'
import { FundBounty } from '@/features/bounty/FundBounty'
import { ListingEditor } from '@/features/bounty/ListingEditor'
import { MilestonesPanel } from '@/features/bounty/MilestonesPanel'
import { ReviewDialog } from '@/features/bounty/ReviewDialog'
import { SelectWinners } from '@/features/bounty/SelectWinners'
import { ClaimPrize, ReclaimFunds } from '@/features/bounty/Settlement'
import { SubmitWork } from '@/features/bounty/SubmitWork'
import { TeamPanel } from '@/features/bounty/TeamPanel'
import { useNow } from '@/hooks/useNow'
import { useIdentity } from '@/contexts/IdentityContext'
import { useActivity, useBounty, useSubmissions } from '@/lib/api/queries'
import { useCategories } from '@/lib/api/ecosystem'
import { ApiError } from '@/lib/api/client'
import { Status, type BountyDetail as Bounty, type Submission } from '@/lib/api/types'
import { formatUsdc, ordinal } from '@/lib/money'
import { describeStructure } from '@/lib/prize'
import { formatDate, timeAgo, timeLeft } from '@/lib/time'

const IMAGE_URL = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i

function Evidence({ s }: { s: Submission }) {
  const images = s.attachments.filter((u) => IMAGE_URL.test(u))
  const others = s.attachments.filter((u) => !IMAGE_URL.test(u))
  const host = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {s.pullRequestUrl && <ExternalLink href={s.pullRequestUrl}>{/github\.com/.test(s.pullRequestUrl) ? 'Pull request or repository' : host(s.pullRequestUrl)}</ExternalLink>}
        {others.map((url) => (
          <ExternalLink key={url} href={url}>
            {host(url)}
          </ExternalLink>
        ))}
      </div>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open screenshot">
                <img src={url} alt="Submitted screenshot" loading="lazy" referrerPolicy="no-referrer" className="h-24 w-auto max-w-[12rem] rounded-md border border-line object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SubmissionItem({ s, self, isCreator, onOpenReview }: { s: Submission; self: boolean; isCreator: boolean; onOpenReview: () => void }) {
  const canReview = (isCreator || self) && s.notesVerified
  return (
    <li className="space-y-2.5 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={s.submitterName ?? s.submitterWallet} src={s.submitterPhoto} size={26} />
          {s.submitterName && <span className="truncate text-sm font-medium">{s.submitterName}</span>}
          <AddressChip address={s.submitterWallet} self={self} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.reviewStatus && s.notesVerified && <ReviewBadge status={s.reviewStatus} />}
          {s.status === 'winner' && <Badge tone="signal">{s.position ? `${ordinal(s.position)} place` : 'Winner'}</Badge>}
          {s.status === 'not_selected' && <Badge>Not selected</Badge>}
          <span className="text-xs text-mute">{timeAgo(s.createdAt)}</span>
        </div>
      </div>
      {s.description ? (
        <>
          <p className="prose-plain text-sm">{s.description}</p>
          <Evidence s={s} />
          {canReview && (
            <Button size="sm" variant={isCreator ? 'secondary' : 'ghost'} onClick={onOpenReview}>
              {isCreator ? 'Review' : 'Review thread'}
              {s.commentCount ? ` (${s.commentCount})` : ''}
            </Button>
          )}
        </>
      ) : (
        <p className="text-sm text-mute">Recorded on-chain. The contributor has not attached their notes yet.</p>
      )}
    </li>
  )
}

function ActionPanel({ bounty, submissions, now }: { bounty: Bounty; submissions: Submission[]; now: number }) {
  const id = useIdentity()
  const me = id.status === 'ready' ? id.address!.toLowerCase() : null
  const isCreator = me === bounty.creatorWallet
  const winnerIndex = me ? bounty.winners.indexOf(me) : -1
  const mySubmission = me ? submissions.find((s) => s.submitterWallet === me) : undefined
  const open = new Date(bounty.deadline).getTime() > now

  const content = (() => {
    if (bounty.status === Status.Claimed) return <p className="text-sm text-mute">Every prize was claimed. This bounty is complete.</p>
    if (bounty.status === Status.Refunded) return <p className="text-sm text-mute">The creator took back the prize, so this bounty is closed.</p>
    if (bounty.status === Status.Cancelled) return <p className="text-sm text-mute">This bounty was cancelled.</p>
    if (!me) return null
    if (bounty.status === Status.Open) {
      return isCreator ? <FundBounty bounty={bounty} /> : <p className="text-sm text-mute">The creator has not funded this bounty yet.</p>
    }

    if (bounty.status === Status.Funded) {
      if (isCreator) {
        return (
          <div className="space-y-6">
            <SelectWinners bounty={bounty} submissions={submissions} />
            {!open && (
              <div className="border-t border-line pt-5">
                <ReclaimFunds bounty={bounty} submissionCount={bounty.submissionCount} now={now} />
              </div>
            )}
          </div>
        )
      }
      if (!open) return <p className="text-sm text-mute">The deadline has passed, so new submissions are closed. The creator is reviewing.</p>
      if (mySubmission?.notesVerified) {
        return (
          <Callout tone="ok" title="You have submitted">
            The creator will review your work and pick winners. Follow the thread under Submissions.
          </Callout>
        )
      }
      return <SubmitWork onchainId={bounty.onchainId} wallet={me} alreadySubmittedOnChain={Boolean(mySubmission)} />
    }

    if (bounty.status === Status.Approved) {
      if (winnerIndex >= 0) {
        return bounty.winnersClaimed[winnerIndex] ? (
          <Callout tone="ok" title="You claimed your prize">
            The USDC is in your wallet.
          </Callout>
        ) : (
          <ClaimPrize bounty={bounty} position={winnerIndex + 1} />
        )
      }
      if (isCreator) return <ReclaimFunds bounty={bounty} submissionCount={bounty.submissionCount} now={now} />
      return <p className="text-sm text-mute">Winners have been picked and are claiming their prizes.</p>
    }

    return null
  })()

  const actionable = bounty.status === Status.Open || bounty.status === Status.Funded || bounty.status === Status.Approved
  if (!actionable) return content
  return <RequireIdentity purpose="take part in this bounty">{content}</RequireIdentity>
}

type Tab = 'overview' | 'milestones' | 'team' | 'submissions' | 'history'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

export default function BountyDetail() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const onchainId = /^[1-9]\d{0,9}$/.test(params.id ?? '') ? Number(params.id) : undefined
  const query = useBounty(onchainId)
  const submissionsQuery = useSubmissions(onchainId, query.isSuccess)
  const activity = useActivity({ bountyId: onchainId, limit: 30 })
  const categories = useCategories()
  const id = useIdentity()
  const now = useNow()
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (onchainId === undefined) {
    return <EmptyState title="That is not a valid bounty link" action={<ButtonLink to="/explore" variant="primary">Back to bounties</ButtonLink>} />
  }

  if (query.isPending) {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]" aria-busy>
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState title="This bounty is not available" action={<ButtonLink to="/explore" variant="primary">Browse bounties</ButtonLink>}>
          It may not exist, or it is still waiting for admin approval and only visible to its creator.
        </EmptyState>
      )
    }
    return <ErrorState title="The bounty did not load" message="Check your connection and try again." onRetry={() => void query.refetch()} />
  }

  const bounty = query.data
  const submissions = submissionsQuery.data ?? []
  const me = id.status === 'ready' ? id.address!.toLowerCase() : null
  const isCreator = me === bounty.creatorWallet
  const reward = BigInt(bounty.rewardAmount)
  const payouts = bounty.prizePayouts
  const open = bounty.status === Status.Funded && new Date(bounty.deadline).getTime() > now
  const category = categories.data?.find((c) => c.slug === bounty.category)

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    ...(bounty.milestoneCount > 0 || isCreator ? [{ value: 'milestones' as Tab, label: 'Milestones', count: bounty.milestoneCount || undefined }] : []),
    ...(bounty.workMode === 'team' ? [{ value: 'team' as Tab, label: 'Team' }] : []),
    { value: 'submissions', label: 'Submissions', count: bounty.submissionCount },
    { value: 'history', label: 'History' },
  ]
  const requested = search.get('tab') as Tab | null
  const tab = tabs.find((t) => t.value === requested)?.value ?? 'overview'

  return (
    <article className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-mute hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> All bounties
      </Link>

      {bounty.moderationStatus === 'pending' && (
        <Callout tone="warn" title="Waiting for admin approval">
          Only you and the admins can see this page. It will appear on the platform once an admin approves it.
        </Callout>
      )}
      {bounty.moderationStatus === 'rejected' && (
        <Callout tone="danger" title="This bounty was not approved">
          {bounty.moderationNote ?? 'An admin rejected it.'} The prize stays in the contract. Contact the team if you think this is a mistake.
        </Callout>
      )}
      {!bounty.metadataVerified && (
        <Callout tone="warn" title="The description has not been published">
          The bounty exists on-chain, but its text was never attached.
        </Callout>
      )}

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={bounty.status} deadline={bounty.deadline} now={now} />
          {bounty.moderationStatus !== 'approved' && <ModerationBadge status={bounty.moderationStatus} />}
          <CategoryChip slug={bounty.category} name={category?.name} icon={category?.icon} />
          {bounty.difficulty && <DifficultyBadge difficulty={bounty.difficulty} />}
          {bounty.workMode === 'team' && (
            <Badge tone="info">
              <Users size={12} aria-hidden /> Team bounty
            </Badge>
          )}
          <span className="num text-sm text-mute">#{bounty.onchainId}</span>
        </div>
        <h1 className="max-w-4xl font-display text-3xl font-semibold leading-tight sm:text-4xl">{bounty.title}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mute">
          {bounty.projectSlug && bounty.projectName && (
            <Link to={`/projects/${bounty.projectSlug}`} className="inline-flex items-center gap-2 font-medium text-ink hover:underline">
              <ProjectAvatar name={bounty.projectName} logoUrl={bounty.projectLogo} size={22} />
              {bounty.projectName}
            </Link>
          )}
          <span className="inline-flex items-center gap-2">
            Posted by
            {bounty.creatorName && <span className="font-medium text-ink">{bounty.creatorName}</span>}
            <AddressChip address={bounty.creatorWallet} self={me === bounty.creatorWallet} />
          </span>
          <span>{formatDate(bounty.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-line bg-surface p-4 lg:hidden">
          <p className="num font-display text-2xl font-semibold">{formatUsdc(reward)} USDC</p>
          <p className="text-sm text-mute">{describeStructure(bounty.prizeShares)}</p>
          <p className="text-sm font-medium">{timeLeft(bounty.deadline, now)}</p>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Tabs label="Bounty sections" value={tab} onChange={(t) => setSearch(t === 'overview' ? {} : { tab: t }, { replace: true })} items={tabs} className="-mt-1" />

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' && (
              <div className="space-y-9">
                {bounty.description && (
                  <Section title="The problem">
                    <p className="prose-plain">{bounty.description}</p>
                  </Section>
                )}
                {bounty.acceptanceCriteria && (
                  <Section title="Requirements">
                    <p className="prose-plain">{bounty.acceptanceCriteria}</p>
                  </Section>
                )}
                {bounty.submissionInstructions && (
                  <Section title="How to submit">
                    <p className="prose-plain">{bounty.submissionInstructions}</p>
                  </Section>
                )}
                {bounty.eligibility && (
                  <Section title="Who can take part">
                    <p className="prose-plain">{bounty.eligibility}</p>
                  </Section>
                )}
                {bounty.links.length > 0 && (
                  <Section title="Links">
                    <ul className="space-y-1.5 text-sm">
                      {bounty.links.map((l) => (
                        <li key={l}>
                          <ExternalLink href={l}>{l}</ExternalLink>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                {(bounty.tags.length > 0 || bounty.skills.length > 0) && (
                  <Section title="Tags and skills">
                    <ul className="flex flex-wrap gap-1.5">
                      {bounty.tags.map((t) => (
                        <li key={`t-${t}`} className="rounded-md bg-ink/5 px-2 py-0.5 text-xs font-medium">
                          {t}
                        </li>
                      ))}
                      {bounty.skills.map((t) => (
                        <li key={`s-${t}`} className="rounded-md border border-line px-2 py-0.5 text-xs font-medium">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink/[0.03] px-4 py-3 text-xs text-mute">
                  <p>
                    <span className="font-medium text-ink">On-chain:</span> prize, deadline, status, winners and the hash of the description above. <span className="font-medium text-ink">On BountyFi:</span> category, difficulty, skills, project, milestones, team and reviews.
                  </p>
                  {isCreator && (
                    <Button size="sm" icon={<Pencil size={13} aria-hidden />} onClick={() => setEditing(true)}>
                      Edit listing details
                    </Button>
                  )}
                </div>
              </div>
            )}

            {tab === 'milestones' && <MilestonesPanel bounty={bounty} wallet={me} isCreator={isCreator} open={open} />}
            {tab === 'team' && <TeamPanel bounty={bounty} wallet={me} isCreator={isCreator} open={open} />}

            {tab === 'submissions' &&
              (submissionsQuery.isError ? (
                <ErrorState title="Submissions did not load" onRetry={() => void submissionsQuery.refetch()} />
              ) : submissionsQuery.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : submissions.length === 0 ? (
                <EmptyState title="No submissions yet">{open ? 'Be the first to send work before the deadline.' : 'Nobody submitted work for this bounty.'}</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {submissions.map((s) => (
                    <SubmissionItem key={s.id} s={s} self={me === s.submitterWallet} isCreator={isCreator} onOpenReview={() => setReviewId(s.id)} />
                  ))}
                </ul>
              ))}

            {tab === 'history' && (
              <div className="space-y-3">
                <p className="text-sm text-mute">Every line is a contract event on Arc, so it can be verified on the explorer.</p>
                <ActivityList items={activity.data?.items ?? []} />
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start" aria-label="Prize and actions">
          <div className="space-y-5 rounded-lg border border-line bg-surface p-5 shadow-card">
            <div>
              <p className="text-sm text-mute">Prize pool</p>
              <p className="num font-display text-4xl font-semibold leading-none">
                {formatUsdc(reward)} <span className="text-lg font-medium text-mute">USDC</span>
              </p>
              <p className="mt-2 text-sm text-mute">{describeStructure(bounty.prizeShares)}</p>
            </div>
            <dl className="space-y-1.5 border-y border-line py-3 text-sm">
              <Detail label="Deadline">{formatDate(bounty.deadline, true)}</Detail>
              <Detail label="Time">{timeLeft(bounty.deadline, now)}</Detail>
            </dl>
            <PrizeLadder shares={bounty.prizeShares} payouts={payouts.length ? payouts : undefined} winners={bounty.winners} claimed={bounty.winnersClaimed} selfAddress={me} />
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <ActionPanel bounty={bounty} submissions={submissions} now={now} />
          </div>
        </aside>
      </div>

      <ReviewDialog type="submission" id={reviewId} onClose={() => setReviewId(null)} />
      {editing && <ListingEditor bounty={bounty} onClose={() => setEditing(false)} />}
    </article>
  )
}

import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { AddressChip, Avatar, TxLink } from '@/components/ui/Address'
import { ButtonLink, ExternalLink } from '@/components/ui/Button'
import { Badge, Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FundBounty } from '@/features/bounty/FundBounty'
import { SelectWinners } from '@/features/bounty/SelectWinners'
import { ClaimPrize, ReclaimFunds } from '@/features/bounty/Settlement'
import { SubmitWork } from '@/features/bounty/SubmitWork'
import { useNow } from '@/hooks/useNow'
import { useIdentity } from '@/contexts/IdentityContext'
import { useActivity, useBounty, useSubmissions } from '@/lib/api/queries'
import { ApiError } from '@/lib/api/client'
import { Status, type BountyDetail as Bounty, type Submission } from '@/lib/api/types'
import { describeActivity } from '@/lib/activityText'
import { formatUsdc, ordinal } from '@/lib/money'
import { describeStructure } from '@/lib/prize'
import { formatDate, timeAgo, timeLeft } from '@/lib/time'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function SubmissionItem({ s, self }: { s: Submission; self: boolean }) {
  return (
    <li className="space-y-2 rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={s.submitterName ?? s.submitterWallet} src={s.submitterPhoto} size={24} />
          {s.submitterName && <span className="truncate text-sm font-bold">{s.submitterName}</span>}
          <AddressChip address={s.submitterWallet} self={self} />
        </div>
        <div className="flex items-center gap-2">
          {s.status === 'winner' && <Badge tone="signal">{s.position ? `${ordinal(s.position)} place` : 'Winner'}</Badge>}
          {s.status === 'not_selected' && <Badge>Not selected</Badge>}
          <span className="text-xs text-mute">{timeAgo(s.createdAt)}</span>
        </div>
      </div>
      {s.description ? (
        <>
          <p className="prose-plain text-sm">{s.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {s.pullRequestUrl && <ExternalLink href={s.pullRequestUrl}>Pull request</ExternalLink>}
            {s.attachments.map((url) => (
              <ExternalLink key={url} href={url}>
                {new URL(url).hostname}
              </ExternalLink>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-mute">Recorded on-chain. The contributor has not attached their notes yet.</p>
      )}
    </li>
  )
}

function History({ onchainId }: { onchainId: number }) {
  const activity = useActivity({ bountyId: onchainId, limit: 30 })
  const items = activity.data?.items ?? []
  if (items.length === 0) return <p className="text-sm text-mute">On-chain events appear here a few seconds after each transaction.</p>
  return (
    <ol className="divide-y divide-line rounded-md border border-line bg-white">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <span>{describeActivity(a)}</span>
          <span className="flex items-center gap-3 text-xs text-mute">
            {timeAgo(a.time)}
            <TxLink hash={a.txHash} />
          </span>
        </li>
      ))}
    </ol>
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
        return <Callout tone="ok" title="You have submitted">The creator will pick winners. You can follow the bounty here.</Callout>
      }
      return <SubmitWork onchainId={bounty.onchainId} wallet={me} alreadySubmittedOnChain={Boolean(mySubmission)} />
    }

    if (bounty.status === Status.Approved) {
      if (winnerIndex >= 0) {
        return bounty.winnersClaimed[winnerIndex] ? (
          <Callout tone="ok" title="You claimed your prize">The USDC is in your wallet.</Callout>
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

export default function BountyDetail() {
  const params = useParams()
  const onchainId = /^[1-9]\d{0,9}$/.test(params.id ?? '') ? Number(params.id) : undefined
  const query = useBounty(onchainId)
  const submissionsQuery = useSubmissions(onchainId, query.isSuccess)
  const id = useIdentity()
  const now = useNow()

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
        <EmptyState
          title="This bounty is not available"
          action={<ButtonLink to="/explore" variant="primary">Browse bounties</ButtonLink>}
        >
          It may not exist, or it is still waiting for admin approval and only visible to its creator.
        </EmptyState>
      )
    }
    return <ErrorState title="The bounty did not load" message="Check your connection and try again." onRetry={() => void query.refetch()} />
  }

  const bounty = query.data
  const submissions = submissionsQuery.data ?? []
  const me = id.status === 'ready' ? id.address!.toLowerCase() : null
  const reward = BigInt(bounty.rewardAmount)
  const payouts = bounty.prizePayouts

  return (
    <article className="space-y-8">
      <Link to="/explore" className="inline-flex items-center gap-1 text-sm font-bold text-mute hover:text-ink">
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
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={bounty.status} deadline={bounty.deadline} now={now} />
          {bounty.moderationStatus !== 'approved' && <ModerationBadge status={bounty.moderationStatus} />}
          <span className="num text-sm text-mute">Bounty #{bounty.onchainId}</span>
        </div>
        <h1 className="max-w-4xl font-display text-3xl font-bold leading-tight sm:text-4xl">{bounty.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-mute">
          <span className="inline-flex items-center gap-2">
            Posted by
            {bounty.creatorName && <span className="font-bold text-ink">{bounty.creatorName}</span>}
            <AddressChip address={bounty.creatorWallet} self={me === bounty.creatorWallet} />
          </span>
          <span>{formatDate(bounty.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-md border-2 border-ink bg-white p-4 lg:hidden">
          <p className="num font-display text-2xl font-bold">{formatUsdc(reward)} USDC</p>
          <p className="text-sm text-mute">{describeStructure(bounty.prizeShares)}</p>
          <p className="text-sm font-bold">{timeLeft(bounty.deadline, now)}</p>
        </div>
        {bounty.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {bounty.tags.map((t) => (
              <li key={t} className="rounded bg-line/70 px-2 py-0.5 text-xs font-medium">
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          {bounty.description && (
            <Section title="The problem">
              <p className="prose-plain">{bounty.description}</p>
            </Section>
          )}
          {bounty.acceptanceCriteria && (
            <Section title="How a fix is judged">
              <p className="prose-plain">{bounty.acceptanceCriteria}</p>
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

          <Section title={`Submissions (${bounty.submissionCount})`}>
            {submissionsQuery.isError ? (
              <ErrorState title="Submissions did not load" onRetry={() => void submissionsQuery.refetch()} />
            ) : submissionsQuery.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : submissions.length === 0 ? (
              <EmptyState title="No submissions yet">
                {bounty.status === Status.Funded && new Date(bounty.deadline).getTime() > now
                  ? 'Be the first to send a fix before the deadline.'
                  : 'Nobody submitted work for this bounty.'}
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {submissions.map((s) => (
                  <SubmissionItem key={s.id} s={s} self={me === s.submitterWallet} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="History">
            <History onchainId={bounty.onchainId} />
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Prize and actions">
          <div className="space-y-5 rounded-md border-2 border-ink bg-white p-5 shadow-hard">
            <div>
              <p className="text-sm text-mute">Prize pool</p>
              <p className="num font-display text-4xl font-bold leading-none">
                {formatUsdc(reward)} <span className="text-lg">USDC</span>
              </p>
              <p className="mt-2 text-sm text-mute">{describeStructure(bounty.prizeShares)}</p>
            </div>
            <dl className="space-y-1 border-y border-line py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Deadline</dt>
                <dd className="text-right font-medium">{formatDate(bounty.deadline, true)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mute">Time</dt>
                <dd className="font-bold">{timeLeft(bounty.deadline, now)}</dd>
              </div>
            </dl>
            <PrizeLadder
              shares={bounty.prizeShares}
              payouts={payouts.length ? payouts : undefined}
              winners={bounty.winners}
              claimed={bounty.winnersClaimed}
              selfAddress={me}
            />
          </div>

          <div className="rounded-md border border-line bg-white p-5">
            <ActionPanel bounty={bounty} submissions={submissions} now={now} />
          </div>
        </aside>
      </div>
    </article>
  )
}

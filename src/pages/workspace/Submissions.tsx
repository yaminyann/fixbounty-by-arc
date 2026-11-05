import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { ReviewBadge } from '@/components/ecosystem/badges'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Feedback'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Segmented, Tabs } from '@/components/ui/Tabs'
import { ReviewDialog } from '@/features/bounty/ReviewDialog'
import { useIdentity } from '@/contexts/IdentityContext'
import { useMyMilestoneSubmissions, useReviewQueue, type ReviewTargetType } from '@/lib/api/ecosystem'
import { useMySubmissions } from '@/lib/api/queries'
import { Status, type ReviewStatus } from '@/lib/api/types'
import { ordinal, shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'

type Tab = 'sent' | 'review'

interface SentItem {
  key: string
  type: ReviewTargetType
  id: string
  onchainId: number
  title: string
  reviewStatus: ReviewStatus
  createdAt: string
  commentCount: number
  winner: number | null
  ready: boolean
  bountyStatus: Status
}

function Sent() {
  const submissions = useMySubmissions(true)
  const milestones = useMyMilestoneSubmissions(true)
  const [open, setOpen] = useState<{ type: ReviewTargetType; id: string } | null>(null)

  const items = useMemo<SentItem[]>(() => {
    const a: SentItem[] = (submissions.data ?? []).map((s) => ({
      key: `s-${s.id}`,
      type: 'submission',
      id: s.id,
      onchainId: s.onchainId,
      title: s.bountyTitle,
      reviewStatus: s.reviewStatus,
      createdAt: s.createdAt,
      commentCount: s.commentCount,
      winner: s.position,
      ready: s.notesVerified,
      bountyStatus: s.bountyStatus,
    }))
    const b: SentItem[] = (milestones.data ?? []).map((m) => ({
      key: `m-${m.id}`,
      type: 'milestone_submission',
      id: m.id,
      onchainId: m.onchainId,
      title: `${m.bountyTitle}: ${m.milestoneTitle}`,
      reviewStatus: m.reviewStatus,
      createdAt: m.createdAt,
      commentCount: m.commentCount,
      winner: null,
      ready: true,
      bountyStatus: m.bountyStatus,
    }))
    return [...a, ...b].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
  }, [submissions.data, milestones.data])

  if (submissions.isError || milestones.isError) return <ErrorState title="Your submissions did not load" onRetry={() => { void submissions.refetch(); void milestones.refetch() }} />
  if (submissions.isPending || milestones.isPending) return <Skeleton className="h-32 w-full" />
  if (items.length === 0) {
    return (
      <EmptyState icon={Inbox} title="You have not submitted work yet" action={<ButtonLink to="/explore" variant="primary">Find a bounty</ButtonLink>}>
        Everything you submit shows up here with its review status.
      </EmptyState>
    )
  }

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {items.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {i.ready ? <ReviewBadge status={i.reviewStatus} /> : <Badge tone="warn">Notes missing</Badge>}
                {i.winner && <Badge tone="signal">{ordinal(i.winner)} place</Badge>}
                {i.type === 'milestone_submission' && <Badge>Milestone</Badge>}
              </div>
              <Link to={`/bounty/${i.onchainId}`} className="block truncate font-display font-semibold hover:underline">
                {i.title}
              </Link>
              <p className="text-xs text-mute">Submitted {timeAgo(i.createdAt)}</p>
            </div>
            {i.ready ? (
              <Button size="sm" onClick={() => setOpen({ type: i.type, id: i.id })}>
                Open thread{i.commentCount > 0 ? ` (${i.commentCount})` : ''}
              </Button>
            ) : (
              <ButtonLink size="sm" to={`/bounty/${i.onchainId}`}>
                Attach notes
              </ButtonLink>
            )}
          </li>
        ))}
      </ul>
      <ReviewDialog type={open?.type ?? 'submission'} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </>
  )
}

function ToReview() {
  const queue = useReviewQueue(true)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [open, setOpen] = useState<{ type: ReviewTargetType; id: string } | null>(null)

  if (queue.isError) return <ErrorState title="The review queue did not load" onRetry={() => void queue.refetch()} />
  if (queue.isPending) return <Skeleton className="h-32 w-full" />

  const items = queue.data.filter((i) => (filter === 'pending' ? i.reviewStatus === 'submitted' && [1, 2].includes(i.bountyStatus) : true))

  return (
    <div className="space-y-4">
      <Segmented
        label="Review filter"
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'pending', label: 'Awaiting my review' },
          { value: 'all', label: 'All submissions' },
        ]}
      />
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={filter === 'pending' ? 'Nothing is waiting for review' : 'No submissions on your bounties yet'}>
          {filter === 'pending' ? 'When someone submits work to one of your bounties it appears here.' : 'Share your bounty to bring in contributors.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((i) => (
            <li key={`${i.type}-${i.id}`} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <ReviewBadge status={i.reviewStatus} />
                  {i.type === 'milestone_submission' && <Badge>Milestone</Badge>}
                  {i.position && <Badge tone="signal">{ordinal(i.position)} place</Badge>}
                </div>
                <span className="text-xs text-mute">{timeAgo(i.createdAt)}</span>
              </div>
              <Link to={`/bounty/${i.onchainId}`} className="block truncate font-display font-semibold hover:underline">
                {i.milestoneTitle ? `${i.bountyTitle}: ${i.milestoneTitle}` : i.bountyTitle}
              </Link>
              <p className="text-sm text-mute">
                From{' '}
                <Link to={`/u/${i.submitterWallet}`} className="font-medium text-ink hover:underline">
                  {i.submitterName ?? shortAddress(i.submitterWallet)}
                </Link>
              </p>
              {i.description && <p className="line-clamp-2 text-sm">{i.description}</p>}
              <Button size="sm" variant={i.reviewStatus === 'submitted' ? 'primary' : 'secondary'} onClick={() => setOpen({ type: i.type, id: i.id })}>
                Review{i.commentCount > 0 ? ` (${i.commentCount})` : ''}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ReviewDialog type={open?.type ?? 'submission'} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </div>
  )
}

export default function Submissions() {
  const id = useIdentity()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'review' ? 'review' : 'sent'
  const queue = useReviewQueue(id.status === 'ready')
  const waiting = (queue.data ?? []).filter((i) => i.reviewStatus === 'submitted' && [1, 2].includes(i.bountyStatus)).length

  return (
    <div>
      <PageHeader title="Submissions">Work you sent, and work sent to your bounties.</PageHeader>
      <RequireIdentity purpose="see your submissions">
        <div className="space-y-6">
          <Tabs
            label="Submissions"
            value={tab}
            onChange={(t) => setParams(t === 'sent' ? {} : { tab: t }, { replace: true })}
            items={[
              { value: 'sent', label: 'Sent by me' },
              { value: 'review', label: 'To review', count: waiting || undefined },
            ]}
          />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'sent' ? <Sent /> : <ToReview />}
          </div>
        </div>
      </RequireIdentity>
    </div>
  )
}

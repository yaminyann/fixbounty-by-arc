import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MilestoneBadge, ReviewBadge } from '@/components/ecosystem/badges'
import { Avatar } from '@/components/ui/Address'
import { Button, ExternalLink } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Dialog } from '@/components/ui/Dialog'
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { ReviewDialog } from '@/features/bounty/ReviewDialog'
import { errorMessage } from '@/lib/api/client'
import { useDeleteMilestone, useMilestones, useSaveMilestone, useSubmitMilestoneWork, type Milestone, type MilestoneSubmission } from '@/lib/api/ecosystem'
import { Status, type BountyDetail } from '@/lib/api/types'
import { splitLines } from '@/lib/metadata'
import { formatUsdc, parseUsdc, shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'

interface Props {
  bounty: BountyDetail
  wallet: string | null
  isCreator: boolean
  open: boolean
}

function MilestoneForm({ bounty, milestone, onClose }: { bounty: BountyDetail; milestone: Milestone | null; onClose: () => void }) {
  const save = useSaveMilestone()
  const [title, setTitle] = useState(milestone?.title ?? '')
  const [description, setDescription] = useState(milestone?.description ?? '')
  const [reward, setReward] = useState(milestone ? formatUsdc(milestone.rewardAmount, 6).replace(/,/g, '') : '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const amount = parseUsdc(reward)
    if (title.trim().length < 3) return setError('Give the milestone a short title.')
    if (!amount) return setError('Enter the planned reward in USDC, for example 50.')
    setError(null)
    try {
      await save.mutateAsync({ onchainId: bounty.onchainId, id: milestone?.id, title: title.trim(), description: description.trim(), rewardAmount: amount.toString() })
      toast.success(milestone ? 'Milestone updated.' : 'Milestone added.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={milestone ? 'Edit milestone' : 'Add a milestone'}
      description={`Planned rewards cannot add up to more than the ${formatUsdc(bounty.rewardAmount)} USDC prize pool.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            {milestone ? 'Save changes' : 'Add milestone'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Backend integration" />
        </Field>
        <Field label="What counts as done" optional>
          <Textarea rows={4} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Planned reward (USDC)">
          <Input inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="300" />
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

function SubmitWorkDialog({ bounty, milestone, onClose }: { bounty: BountyDetail; milestone: Milestone; onClose: () => void }) {
  const submit = useSubmitMilestoneWork()
  const [description, setDescription] = useState('')
  const [links, setLinks] = useState('')
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (description.trim().length < 10) return setError('Describe what you delivered in at least a sentence.')
    setError(null)
    try {
      await submit.mutateAsync({ onchainId: bounty.onchainId, id: milestone.id, description: description.trim(), links: splitLines(links) })
      toast.success('Milestone work submitted. The creator was notified.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Submit work: ${milestone.title}`}
      description="Recorded on BountyFi for review. It is not an on-chain transaction."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={submit.isPending} onClick={() => void send()}>
            Submit work
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What you delivered">
          <Textarea rows={5} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Links" optional hint="One per line: pull request, repository, document, screenshot or demo.">
          <Textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://github.com/org/repo/pull/12" />
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

function SubmissionLine({ s, onReview, mine, isCreator }: { s: MilestoneSubmission; onReview: () => void; mine: boolean; isCreator: boolean }) {
  const detailed = s.description !== undefined
  return (
    <li className="space-y-2 rounded-lg bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={s.submitterName ?? s.submitterWallet} src={s.submitterPhoto} size={22} />
          <Link to={`/u/${s.submitterWallet}`} className="truncate text-sm font-medium hover:underline">
            {s.submitterName ?? shortAddress(s.submitterWallet)}
          </Link>
          {mine && <span className="rounded bg-signal px-1.5 text-xs font-medium">You</span>}
          {s.createdAt && <span className="text-xs text-mute">{timeAgo(s.createdAt)}</span>}
        </div>
        <ReviewBadge status={s.reviewStatus} />
      </div>
      {detailed && (
        <>
          <p className="prose-plain text-sm">{s.description}</p>
          {s.links && s.links.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {s.links.map((l) => (
                <li key={l}>
                  <ExternalLink href={l}>{l}</ExternalLink>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" onClick={onReview}>
            {isCreator ? 'Review' : 'Open thread'}
            {s.commentCount ? ` (${s.commentCount})` : ''}
          </Button>
        </>
      )}
    </li>
  )
}

export function MilestonesPanel({ bounty, wallet, isCreator, open }: Props) {
  const query = useMilestones(bounty.onchainId)
  const remove = useDeleteMilestone()
  const { confirm, dialog } = useConfirm()
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null)
  const [submitting, setSubmitting] = useState<Milestone | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(null)

  if (query.isPending) return <Skeleton className="h-40 w-full" />
  if (query.isError) return <ErrorState title="Milestones did not load" onRetry={() => void query.refetch()} />

  const { items, plannedTotal, editable } = query.data
  const approved = items.filter((m) => m.status === 'approved').length
  const prize = BigInt(bounty.rewardAmount)
  const planned = BigInt(plannedTotal)
  const canWork = open && !isCreator && bounty.status === Status.Funded

  const onDelete = async (m: Milestone) => {
    const ok = await confirm({ title: 'Remove this milestone?', description: `"${m.title}" will be deleted. This cannot be undone.`, confirmLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await remove.mutateAsync({ onchainId: bounty.onchainId, id: m.id })
      toast.success('Milestone removed.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Milestones are coordination, not payments">
        The contract escrows one prize per bounty and pays winners by place. Milestone amounts and approvals are recorded on BountyFi to organise the work; they do not release USDC by themselves.
      </Callout>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">
          {items.length === 0 ? 'No milestones yet.' : `${approved} of ${items.length} approved · ${formatUsdc(planned)} of ${formatUsdc(prize)} USDC planned`}
        </p>
        {editable && (
          <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
            Add milestone
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title="This bounty has no milestones">
          {isCreator ? 'Split a larger bounty into reviewable pieces with their own descriptions and planned rewards.' : 'The creator has not split this bounty into milestones.'}
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((m) => {
            const mine = m.submissions.find((s) => wallet !== null && s.submitterWallet === wallet)
            const approvedBy = m.submissions.find((s) => s.approved)
            return (
              <li key={m.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink/5 text-xs font-medium">
                      {m.status === 'approved' ? <Check size={13} aria-label="Approved" /> : m.position}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display font-semibold leading-snug">{m.title}</p>
                      {m.description && <p className="prose-plain mt-1 text-sm text-mute">{m.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MilestoneBadge status={m.status} />
                    <span className="num text-sm font-semibold">{formatUsdc(m.rewardAmount)} USDC</span>
                  </div>
                </div>

                {m.status === 'approved' && approvedBy && (
                  <p className="text-sm text-mute">
                    Approved{m.approvedAt ? ` ${timeAgo(m.approvedAt)}` : ''} for{' '}
                    <Link to={`/u/${approvedBy.submitterWallet}`} className="font-medium text-ink hover:underline">
                      {approvedBy.submitterName ?? shortAddress(approvedBy.submitterWallet)}
                    </Link>
                  </p>
                )}

                {m.submissions.filter((s) => !(m.status === 'approved' && s.approved && !isCreator && !mine)).length > 0 && (
                  <ul className="space-y-2">
                    {m.submissions.map((s) => (
                      <SubmissionLine key={s.id} s={s} mine={wallet !== null && s.submitterWallet === wallet} isCreator={isCreator} onReview={() => setReviewId(s.id)} />
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {canWork && !mine && m.status !== 'approved' && (
                    <RequireIdentity purpose="submit milestone work">
                      <Button size="sm" variant="primary" onClick={() => setSubmitting(m)}>
                        Submit work
                      </Button>
                    </RequireIdentity>
                  )}
                  {editable && m.status !== 'approved' && (
                    <>
                      <Button size="sm" icon={<Pencil size={14} aria-hidden />} onClick={() => setEditing(m)}>
                        Edit
                      </Button>
                      {m.submissionCount === 0 && (
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={() => void onDelete(m)}>
                          Remove
                        </Button>
                      )}
                    </>
                  )}
                  {!isCreator && m.submissionCount > 0 && !mine && m.status !== 'approved' && <span className="text-xs text-mute">{m.submissionCount} submitted</span>}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {editing && <MilestoneForm bounty={bounty} milestone={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {submitting && <SubmitWorkDialog bounty={bounty} milestone={submitting} onClose={() => setSubmitting(null)} />}
      <ReviewDialog type="milestone_submission" id={reviewId} onClose={() => setReviewId(null)} />
      {dialog}
    </div>
  )
}

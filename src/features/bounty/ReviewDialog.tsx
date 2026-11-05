import { useState } from 'react'
import { toast } from 'sonner'
import { ReviewBadge } from '@/components/ecosystem/badges'
import { Avatar } from '@/components/ui/Address'
import { Button, ExternalLink } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Dialog } from '@/components/ui/Dialog'
import { Callout, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Textarea } from '@/components/ui/Form'
import { errorMessage } from '@/lib/api/client'
import { useReviewComment, useReviewDecision, useReviewThread, type ReviewComment, type ReviewKind, type ReviewTargetType } from '@/lib/api/ecosystem'
import type { ReviewStatus } from '@/lib/api/types'
import { splitLines } from '@/lib/metadata'
import { shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'

const KIND_LABEL: Record<ReviewKind, string> = {
  comment: 'commented',
  revision_request: 'requested changes',
  approved: 'approved the submission',
  rejected: 'did not accept the submission',
  update: 'added an update',
  reopened: 'reopened the review',
}

function Entry({ c }: { c: ReviewComment }) {
  return (
    <li className="flex gap-3">
      <Avatar name={c.authorName ?? c.authorWallet} src={c.authorPhoto} size={28} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{c.authorName ?? shortAddress(c.authorWallet)}</span>{' '}
          <span className="text-mute">
            {KIND_LABEL[c.kind]} · {timeAgo(c.createdAt)}
          </span>
          <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 text-xs text-mute">{c.authorRole === 'reviewer' ? 'Reviewer' : 'Contributor'}</span>
        </p>
        {c.body && <p className="prose-plain rounded-lg bg-paper px-3 py-2 text-sm">{c.body}</p>}
        {c.links.length > 0 && (
          <ul className="space-y-0.5 text-sm">
            {c.links.map((l) => (
              <li key={l}>
                <ExternalLink href={l}>{l}</ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

/**
 * The review thread of one submission. The creator reviews and decides; the contributor replies with updates.
 * A decision here is a recorded review. USDC moves only when the creator picks winners on-chain.
 */
export function ReviewDialog({ type, id, onClose }: { type: ReviewTargetType; id: string | null; onClose: () => void }) {
  const thread = useReviewThread(type, id ?? undefined)
  const decide = useReviewDecision()
  const comment = useReviewComment()
  const { confirm, dialog } = useConfirm()
  const [note, setNote] = useState('')
  const [links, setLinks] = useState('')

  const data = thread.data
  const role = data?.role
  const status = data?.target.reviewStatus
  const closed = data ? ![1, 2].includes(data.target.bountyStatus) : false
  const title = data?.target.milestoneTitle ? `Milestone: ${data.target.milestoneTitle}` : 'Submission review'

  const reset = () => {
    setNote('')
    setLinks('')
  }

  const send = async (kind: 'comment' | 'update') => {
    if (!id) return
    try {
      await comment.mutateAsync({ type, id, body: note.trim(), links: splitLines(links), kind })
      reset()
      toast.success(kind === 'update' ? 'Update sent. The reviewer will see it.' : 'Comment posted.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const decision = async (next: ReviewStatus) => {
    if (!id) return
    if (next === 'approved' || next === 'rejected') {
      const ok = await confirm({
        title: next === 'approved' ? 'Approve this submission?' : 'Reject this submission?',
        description:
          next === 'approved'
            ? 'This records your approval and notifies the contributor. Money moves only when you pick winners on-chain.'
            : 'The contributor is notified and sees your note.',
        confirmLabel: next === 'approved' ? 'Approve' : 'Reject',
        danger: next === 'rejected',
      })
      if (!ok) return
    }
    try {
      await decide.mutateAsync({ type, id, decision: next, note: note.trim() })
      reset()
      toast.success(next === 'changes_requested' ? 'Revision requested.' : next === 'approved' ? 'Submission approved.' : next === 'rejected' ? 'Submission rejected.' : 'Review reopened.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <Dialog open={id !== null} onClose={onClose} size="lg" title={title} description={data ? data.target.bountyTitle : undefined}>
        {thread.isPending && (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {thread.isError && <ErrorState title="The review did not load" message={errorMessage(thread.error)} onRetry={() => void thread.refetch()} />}
        {data && status && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ReviewBadge status={status} />
              <span className="text-mute">Contributor {shortAddress(data.target.submitterWallet)}</span>
            </div>

            {data.comments.length === 0 ? (
              <p className="text-sm text-mute">No comments yet. Start the conversation below.</p>
            ) : (
              <ol className="space-y-4" aria-label="Review thread">
                {data.comments.map((c) => (
                  <Entry key={c.id} c={c} />
                ))}
              </ol>
            )}

            {role === 'admin' && <Callout>Admins can read review threads but cannot post in them.</Callout>}
            {closed && role !== 'admin' && <Callout tone="info">This bounty is closed, so the review can no longer change. You can still add comments.</Callout>}

            {role !== 'admin' && (
              <div className="space-y-4 border-t border-line pt-4">
                <Field label={role === 'reviewer' ? 'Your note' : 'Reply'} hint={role === 'reviewer' ? 'Required when you request changes or reject.' : 'Explain what changed, and add links to new work.'}>
                  <Textarea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
                </Field>
                {role === 'contributor' && (
                  <Field label="Links" optional hint="One per line: pull request, document, screenshot, demo.">
                    <Textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://github.com/org/repo/pull/12" />
                  </Field>
                )}

                {role === 'reviewer' && (
                  <div className="flex flex-wrap gap-2">
                    <Button loading={comment.isPending} disabled={!note.trim()} onClick={() => void send('comment')}>
                      Comment
                    </Button>
                    {!closed && data.target.ready && (
                      <>
                        {status !== 'changes_requested' && (
                          <Button variant="secondary" loading={decide.isPending} disabled={note.trim().length < 3} onClick={() => void decision('changes_requested')}>
                            Request changes
                          </Button>
                        )}
                        {status !== 'approved' && (
                          <Button variant="primary" loading={decide.isPending} onClick={() => void decision('approved')}>
                            Approve
                          </Button>
                        )}
                        {status !== 'rejected' && (
                          <Button variant="danger" loading={decide.isPending} disabled={note.trim().length < 3} onClick={() => void decision('rejected')}>
                            Reject
                          </Button>
                        )}
                        {status !== 'submitted' && (
                          <Button variant="ghost" loading={decide.isPending} onClick={() => void decision('submitted')}>
                            Reopen
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {role === 'contributor' && (
                  <div className="flex flex-wrap gap-2">
                    {!closed && (
                      <Button variant="primary" loading={comment.isPending} disabled={!note.trim()} onClick={() => void send('update')}>
                        Send update
                      </Button>
                    )}
                    <Button loading={comment.isPending} disabled={!note.trim()} onClick={() => void send('comment')}>
                      Comment only
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
      {dialog}
    </>
  )
}

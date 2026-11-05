import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { Avatar } from '@/components/ui/Address'
import { Button } from '@/components/ui/Button'
import { Callout, EmptyState, ErrorState, Skeleton, Badge } from '@/components/ui/Feedback'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Form'
import { errorMessage } from '@/lib/api/client'
import { useApplications, useApply, useDecideApplication, useWithdrawApplication, type Application } from '@/lib/api/collab'
import { Status, type BountyDetail } from '@/lib/api/types'
import { shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'

function ApplyDialog({ bounty, onClose }: { bounty: BountyDetail; onClose: () => void }) {
  const apply = useApply()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    setError(null)
    try {
      await apply.mutateAsync({ onchainId: bounty.onchainId, message: message.trim() })
      toast.success('Application sent. The creator was notified.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Apply to work on this bounty"
      description="Tell the creator you plan to take it. Approval is a signal between you and the creator."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={apply.isPending} onClick={() => void send()}>
            Send application
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What will you do, and when?" optional>
          <Textarea rows={4} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
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

function DeclineDialog({ app, bounty, onClose }: { app: Application; bounty: BountyDetail; onClose: () => void }) {
  const decide = useDecideApplication()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    setError(null)
    try {
      await decide.mutateAsync({ onchainId: bounty.onchainId, id: app.id, decision: 'decline', note: note.trim() })
      toast.success('Application declined.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Decline ${app.name ?? shortAddress(app.wallet)}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={decide.isPending} onClick={() => void send()}>
            Decline
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" hint="They will see this.">
          <Textarea rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
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

export function ApplicationsPanel({ bounty, wallet, isCreator, open }: { bounty: BountyDetail; wallet: string | null; isCreator: boolean; open: boolean }) {
  const query = useApplications(bounty.onchainId)
  const decide = useDecideApplication()
  const withdraw = useWithdrawApplication()
  const [applying, setApplying] = useState(false)
  const [declining, setDeclining] = useState<Application | null>(null)

  if (query.isPending) return <Skeleton className="h-32 w-full" />
  if (query.isError) return <ErrorState title="Applications did not load" onRetry={() => void query.refetch()} />

  const mine = query.data.items.find((a) => wallet !== null && a.wallet === wallet)
  const canApply = open && !isCreator && bounty.status === Status.Funded && !mine

  const approve = async (a: Application) => {
    try {
      await decide.mutateAsync({ onchainId: bounty.onchainId, id: a.id, decision: 'approve' })
      toast.success('Approved. They were notified.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const pull = async () => {
    try {
      await withdraw.mutateAsync({ onchainId: bounty.onchainId })
      toast.success('Application withdrawn.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <Callout title="Applications are a signal, not a lock">
        The contract accepts a submission from any wallet before the deadline. Approving an applicant tells everyone who the creator expects to hear from. It does not stop anyone else from submitting.
      </Callout>

      {canApply && (
        <RequireIdentity purpose="apply to this bounty">
          <Button variant="primary" onClick={() => setApplying(true)}>
            Apply to work on this
          </Button>
        </RequireIdentity>
      )}
      {mine && (
        <Callout
          tone={mine.status === 'approved' ? 'ok' : mine.status === 'declined' ? 'danger' : 'info'}
          title={mine.status === 'approved' ? 'You were approved' : mine.status === 'declined' ? 'Your application was declined' : 'Your application is waiting for the creator'}
          action={
            mine.status !== 'declined' && (
              <Button size="sm" loading={withdraw.isPending} onClick={() => void pull()}>
                Withdraw
              </Button>
            )
          }
        >
          {mine.status === 'declined' ? mine.decisionNote : mine.message}
        </Callout>
      )}

      {query.data.items.length === 0 ? (
        <EmptyState title="No one is approved yet">{isCreator ? 'Applications from contributors will appear here.' : 'Be the first to apply.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {query.data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={a.name ?? a.wallet} src={a.photo} size={32} />
                <div className="min-w-0">
                  <Link to={`/u/${a.wallet}`} className="font-medium hover:underline">
                    {a.name ?? shortAddress(a.wallet)}
                  </Link>
                  <p className="text-xs text-mute">Applied {timeAgo(a.appliedAt)}</p>
                  {a.message && <p className="prose-plain mt-1 text-sm">{a.message}</p>}
                  {a.status === 'declined' && a.decisionNote && <p className="mt-1 text-sm text-mute">Declined: {a.decisionNote}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={a.status === 'approved' ? 'ok' : a.status === 'declined' ? 'danger' : 'info'}>{a.status === 'requested' ? 'Waiting' : a.status === 'approved' ? 'Approved' : 'Declined'}</Badge>
                {isCreator && a.status === 'requested' && (
                  <>
                    <Button size="sm" variant="primary" onClick={() => void approve(a)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeclining(a)}>
                      Decline
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {applying && <ApplyDialog bounty={bounty} onClose={() => setApplying(false)} />}
      {declining && <DeclineDialog app={declining} bounty={bounty} onClose={() => setDeclining(null)} />}
    </div>
  )
}

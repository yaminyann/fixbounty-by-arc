import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Callout, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Button, ExternalLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select, Textarea } from '@/components/ui/Form'
import { errorMessage } from '@/lib/api/client'
import { useDispute, useDisputeComment, useOpenDispute, useResolveDispute, type DisputeReason, type DisputeStatus } from '@/lib/api/collab'
import { splitLines } from '@/lib/metadata'
import { shortAddress } from '@/lib/money'
import { formatDate, timeAgo } from '@/lib/time'

export const REASON_TEXT: Record<DisputeReason, string> = {
  rejected: 'Work was rejected',
  reclaimed: 'Prize reclaimed after submitting',
  no_decision: 'No decision after the deadline',
}

const STATUS: Record<DisputeStatus, { label: string; tone: 'info' | 'ok' | 'neutral' | 'warn' }> = {
  open: { label: 'Open', tone: 'warn' },
  upheld: { label: 'Upheld', tone: 'ok' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
  settled: { label: 'Settled', tone: 'info' },
}

export function DisputeBadge({ status }: { status: DisputeStatus }) {
  const s = STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

const ROLE_LABEL = { contributor: 'Contributor', creator: 'Creator', mediator: 'Mediator' } as const

/** The thread of one dispute, with the reply box and, for admins, the controls that close it. */
export function DisputeView({ id }: { id: string }) {
  const query = useDispute(id)
  const comment = useDisputeComment()
  const resolve = useResolveDispute()
  const [body, setBody] = useState('')
  const [links, setLinks] = useState('')
  const [outcome, setOutcome] = useState<'upheld' | 'dismissed' | 'settled'>('upheld')
  const [note, setNote] = useState('')

  if (query.isPending) return <Skeleton className="h-40 w-full" />
  if (query.isError) return <ErrorState title="The dispute did not load" message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  const { dispute, role, comments } = query.data
  const open = dispute.status === 'open'

  const send = async () => {
    try {
      await comment.mutateAsync({ id, body: body.trim(), links: splitLines(links), mediator: role === 'mediator' })
      setBody('')
      setLinks('')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const close = async () => {
    try {
      await resolve.mutateAsync({ id, outcome, note: note.trim() })
      toast.success('Dispute closed.')
      setNote('')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <DisputeBadge status={dispute.status} />
        <Badge>{REASON_TEXT[dispute.reason]}</Badge>
        <Link to={`/bounty/${dispute.onchainId}`} className="font-medium hover:underline">
          {dispute.bountyTitle}
        </Link>
        <span className="text-mute">
          Contributor {shortAddress(dispute.submitterWallet)} · Creator {shortAddress(dispute.creatorWallet)} · opened {formatDate(dispute.createdAt)}
        </span>
      </div>

      <Callout title="Mediation is a record, not a ruling on money">
        The contract has no dispute logic, so a creator can still take a prize back. An admin reads both sides and records an outcome that stays on the creator's public record.
      </Callout>

      <div className="rounded-lg bg-paper px-4 py-3">
        <p className="mb-1 text-xs font-medium text-mute">Contributor's summary</p>
        <p className="prose-plain text-sm">{dispute.summary}</p>
      </div>

      <ol className="space-y-4" aria-label="Dispute thread">
        {comments.map((c) => (
          <li key={c.id} className="space-y-1">
            <p className="text-sm">
              <span className="font-medium">{c.authorName ?? (c.authorWallet ? shortAddress(c.authorWallet) : ROLE_LABEL[c.authorRole])}</span>{' '}
              <span className="rounded bg-ink/5 px-1.5 py-0.5 text-xs text-mute">{ROLE_LABEL[c.authorRole]}</span>{' '}
              <span className="text-xs text-mute">{timeAgo(c.createdAt)}</span>
            </p>
            <p className="prose-plain rounded-lg border border-line px-3 py-2 text-sm">{c.body}</p>
            {c.links.map((l) => (
              <p key={l} className="text-sm">
                <ExternalLink href={l}>{l}</ExternalLink>
              </p>
            ))}
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-mute">No messages yet.</li>}
      </ol>

      {!open && dispute.resolutionNote && (
        <Callout tone={dispute.status === 'upheld' ? 'ok' : 'info'} title={`Closed: ${STATUS[dispute.status].label.toLowerCase()}`}>
          {dispute.resolutionNote}
        </Callout>
      )}

      {open && (
        <div className="space-y-4 border-t border-line pt-4">
          <Field label={role === 'mediator' ? 'Message as mediator' : 'Reply'} hint="Add evidence as links below. Do not paste secrets.">
            <Textarea rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Evidence links" optional>
            <Textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://github.com/org/repo/pull/12" />
          </Field>
          <Button variant="primary" loading={comment.isPending} disabled={!body.trim()} onClick={() => void send()}>
            Send
          </Button>
        </div>
      )}

      {open && role === 'mediator' && (
        <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
          <h3 className="font-display text-base font-semibold">Close this dispute</h3>
          <Field label="Outcome">
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
              <option value="upheld">Upheld: the contributor's complaint is justified</option>
              <option value="dismissed">Dismissed: the creator's decision stands</option>
              <option value="settled">Settled: the parties resolved it</option>
            </Select>
          </Field>
          <Field label="Explanation" hint="Both sides and the public record see this. At least 10 characters.">
            <Textarea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button variant="primary" loading={resolve.isPending} disabled={note.trim().length < 10} onClick={() => void close()}>
            Record outcome
          </Button>
        </div>
      )}
    </div>
  )
}

export function DisputeDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Dialog open={id !== null} onClose={onClose} size="lg" title="Dispute">
      {id && <DisputeView id={id} />}
    </Dialog>
  )
}

/** Opens a dispute for one submission. The server decides whether the rules allow it and says why when they do not. */
export function OpenDisputeDialog({ submissionId, title, onClose, onOpened }: { submissionId: string; title: string; onClose: () => void; onOpened: (id: string) => void }) {
  const open = useOpenDispute()
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    setError(null)
    try {
      const created = await open.mutateAsync({ submissionId, summary: summary.trim() })
      toast.success('Dispute opened. The creator and the admins were notified.')
      onOpened(created.id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Open a dispute"
      description={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={open.isPending} disabled={summary.trim().length < 20} onClick={() => void send()}>
            Open dispute
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-mute">
          Use this when your work was rejected, a prize was taken back after you submitted, or the creator has not decided three days after the deadline. An admin will read both sides.
        </p>
        <Field label="What happened, and why do you disagree?" hint="At least 20 characters.">
          <Textarea rows={5} value={summary} maxLength={3000} onChange={(e) => setSummary(e.target.value)} />
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

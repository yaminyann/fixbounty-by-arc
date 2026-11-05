import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/Dialog'
import { Button, ExternalLink } from '@/components/ui/Button'
import { AddressChip } from '@/components/ui/Address'
import { Callout } from '@/components/ui/Feedback'
import { Field, Textarea } from '@/components/ui/Form'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { useModerate } from '@/lib/api/queries'
import { errorMessage } from '@/lib/api/client'
import { Status, type AdminBounty } from '@/lib/api/types'
import { computePayouts, formatUsdc } from '@/lib/money'
import { formatDate } from '@/lib/time'

/** Everything an admin needs to decide whether a bounty goes public. */
export function ReviewDialog({ bounty, onClose }: { bounty: AdminBounty | null; onClose: () => void }) {
  const moderate = useModerate()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: 'approved' | 'rejected' | 'pending') => {
    if (!bounty) return
    setError(null)
    try {
      await moderate.mutateAsync({ onchainId: bounty.onchainId, decision, note: note.trim() || undefined })
      toast.success(decision === 'approved' ? 'Approved. It is now public.' : decision === 'rejected' ? 'Rejected. It is hidden.' : 'Moved back to the review queue.')
      setNote('')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const funded = bounty ? bounty.status !== Status.Open && bounty.status !== Status.Cancelled : false

  return (
    <Dialog
      open={Boolean(bounty)}
      onClose={onClose}
      size="lg"
      title={bounty ? `#${bounty.onchainId} ${bounty.title}` : ''}
      footer={
        bounty && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {bounty.moderationStatus !== 'pending' && (
              <Button loading={moderate.isPending} onClick={() => void decide('pending')}>
                Move to review queue
              </Button>
            )}
            {bounty.moderationStatus !== 'rejected' && (
              <Button variant="danger" loading={moderate.isPending} onClick={() => void decide('rejected')}>
                Reject
              </Button>
            )}
            {bounty.moderationStatus !== 'approved' && (
              <Button variant="primary" loading={moderate.isPending} disabled={!bounty.metadataVerified || !funded} onClick={() => void decide('approved')}>
                Approve and publish
              </Button>
            )}
          </>
        )
      }
    >
      {bounty && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <ModerationBadge status={bounty.moderationStatus} />
            <StatusBadge status={bounty.status} deadline={bounty.deadline} />
            <span className="num text-sm font-semibold">{formatUsdc(bounty.rewardAmount)} USDC</span>
          </div>

          {!bounty.metadataVerified && <Callout tone="warn" title="Description not published">The creator created this on-chain but never attached the text, so it cannot be approved.</Callout>}
          {bounty.metadataVerified && !funded && <Callout tone="warn" title="Not funded">The prize is not in escrow yet, so it cannot be approved.</Callout>}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-mute">Creator</dt>
              <dd className="font-medium">{bounty.creatorName ?? 'Unknown'} {bounty.creatorEmail && <span className="text-mute">({bounty.creatorEmail})</span>}</dd>
              <dd><AddressChip address={bounty.creatorWallet} /></dd>
            </div>
            <div>
              <dt className="text-mute">Deadline</dt>
              <dd className="font-medium">{formatDate(bounty.deadline, true)}</dd>
              <dt className="mt-2 text-mute">Posted</dt>
              <dd className="font-medium">{formatDate(bounty.createdAt, true)}</dd>
            </div>
          </dl>

          {bounty.description && (
            <div className="space-y-1">
              <h3 className="font-display font-semibold">Description</h3>
              <p className="prose-plain text-sm">{bounty.description}</p>
            </div>
          )}
          {bounty.acceptanceCriteria && (
            <div className="space-y-1">
              <h3 className="font-display font-semibold">How a fix is judged</h3>
              <p className="prose-plain text-sm">{bounty.acceptanceCriteria}</p>
            </div>
          )}
          {bounty.links.length > 0 && (
            <div className="space-y-1">
              <h3 className="font-display font-semibold">Links</h3>
              <ul className="space-y-1 text-sm">
                {bounty.links.map((l) => (
                  <li key={l}>
                    <ExternalLink href={l}>{l}</ExternalLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2">
            <h3 className="font-display font-semibold">Prize structure</h3>
            <PrizeLadder shares={bounty.prizeShares} payouts={computePayouts(BigInt(bounty.rewardAmount), bounty.prizeShares)} />
          </div>

          {bounty.moderationNote && (
            <p className="text-sm text-mute">
              Last note by {bounty.moderatedBy}: {bounty.moderationNote}
            </p>
          )}

          <Field label="Note to the creator" optional hint="Required when rejecting. The creator sees this on their dashboard.">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

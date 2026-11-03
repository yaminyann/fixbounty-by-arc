import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Feedback'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select } from '@/components/ui/Form'
import { FeeLedger } from '@/components/bounty/FeeLedger'
import { useTx } from '@/hooks/useBountyContract'
import { useRefreshBounty } from '@/lib/api/queries'
import type { BountyDetail, Submission } from '@/lib/api/types'
import { formatUsdc, ordinal, shortAddress } from '@/lib/money'

/**
 * The creator assigns submitters to prize places. Places fill from the top, and any place left empty is
 * returned to the creator in the same transaction, so one winner, a few, or all places are handled the same way.
 */
export function SelectWinners({ bounty, submissions }: { bounty: BountyDetail; submissions: Submission[] }) {
  const [open, setOpen] = useState(false)
  const [picks, setPicks] = useState<string[]>([])
  const tx = useTx()
  const refresh = useRefreshBounty()

  const payouts = bounty.prizePayouts.map(BigInt)
  const chosen = picks.filter(Boolean)
  const awarded = chosen.reduce((sum, _w, i) => sum + payouts[i], 0n)
  const returned = BigInt(bounty.rewardAmount) - awarded

  const setPick = (index: number, wallet: string) => {
    const next = [...picks]
    next[index] = wallet
    // Clearing a place clears every lower place, because places fill from the top.
    if (!wallet) next.length = index
    setPicks(next)
  }

  const confirm = async () => {
    try {
      await tx.board('approveWinners', [BigInt(bounty.onchainId), chosen as `0x${string}`[]])
      await refresh(bounty.onchainId)
      setOpen(false)
      setPicks([])
      toast.success(`${chosen.length === 1 ? 'Winner' : 'Winners'} approved. They can claim now.`)
    } catch {
      // shown in the dialog
    }
  }

  if (submissions.length === 0) {
    return <p className="text-sm text-mute">Winners can be picked once someone submits work.</p>
  }

  return (
    <>
      <Button variant="primary" size="lg" className="w-full" onClick={() => setOpen(true)}>
        {bounty.winnerSlots === 1 ? 'Pick the winner' : 'Pick winners'}
      </Button>

      <Dialog
        open={open}
        onClose={() => !tx.pending && setOpen(false)}
        size="lg"
        title={bounty.winnerSlots === 1 ? 'Pick the winner' : 'Assign the prize places'}
        description="This is final. Once you approve, submissions close and winners can claim."
        footer={
          <>
            <Button variant="ghost" disabled={tx.pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={chosen.length === 0} loading={tx.pending} onClick={() => void confirm()}>
              Approve {chosen.length} {chosen.length === 1 ? 'winner' : 'winners'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {Array.from({ length: bounty.winnerSlots }, (_, i) => {
            const previousFilled = i === 0 || Boolean(picks[i - 1])
            const takenElsewhere = new Set(picks.filter((_w, j) => j !== i && picks[j]))
            return (
              <Field
                key={i}
                label={`${ordinal(i + 1)} place, ${formatUsdc(payouts[i])} USDC`}
                hint={previousFilled ? undefined : `Choose ${ordinal(i)} place first.`}
              >
                <Select value={picks[i] ?? ''} disabled={!previousFilled} onChange={(e) => setPick(i, e.target.value)}>
                  <option value="">{i === 0 ? 'Select a submission' : 'Leave empty and return this prize to me'}</option>
                  {submissions
                    .filter((s) => !takenElsewhere.has(s.submitterWallet))
                    .map((s) => (
                      <option key={s.id} value={s.submitterWallet}>
                        {s.submitterName ? `${s.submitterName}, ` : ''}
                        {shortAddress(s.submitterWallet)}
                        {s.notesVerified ? '' : ' (no notes yet)'}
                      </option>
                    ))}
                </Select>
              </Field>
            )
          })}

          {chosen.length > 0 ? (
            <FeeLedger
              lines={[
                { label: `Awarded to ${chosen.length} ${chosen.length === 1 ? 'winner' : 'winners'}`, value: `${formatUsdc(awarded)} USDC` },
                { label: 'Returned to you now', value: `${formatUsdc(returned)} USDC`, muted: returned === 0n },
              ]}
            />
          ) : (
            <p className="text-sm text-mute">Choose at least the 1st place to see what is awarded and what returns to you.</p>
          )}

          {chosen.length < bounty.winnerSlots && chosen.length > 0 && (
            <Callout tone="info">
              {bounty.winnerSlots - chosen.length} {bounty.winnerSlots - chosen.length === 1 ? 'place is' : 'places are'} empty, so{' '}
              {formatUsdc(returned)} USDC goes back to your wallet when you approve.
            </Callout>
          )}

          {tx.error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {tx.error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  )
}

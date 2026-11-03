import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Feedback'
import { FeeLedger } from '@/components/bounty/FeeLedger'
import { useTx } from '@/hooks/useBountyContract'
import { useRefreshBounty } from '@/lib/api/queries'
import { Status, type BountyDetail } from '@/lib/api/types'
import { claimFee, formatUsdc, ordinal } from '@/lib/money'
import { formatDate } from '@/lib/time'

/** A winner claims their share. */
export function ClaimPrize({ bounty, position }: { bounty: BountyDetail; position: number }) {
  const tx = useTx()
  const refresh = useRefreshBounty()
  const gross = BigInt(bounty.prizePayouts[position - 1] ?? '0')
  const fee = claimFee(gross)

  const claim = async () => {
    try {
      await tx.board('claimReward', [BigInt(bounty.onchainId)])
      await refresh(bounty.onchainId)
      toast.success(`${formatUsdc(gross - fee, 4)} USDC sent to your wallet.`)
    } catch {
      // shown below
    }
  }

  const deadline = bounty.approvedAt ? new Date(new Date(bounty.approvedAt).getTime() + 7 * 24 * 3600 * 1000) : null

  return (
    <div className="space-y-4">
      <Callout tone="ok" title={`You won ${ordinal(position)} place`}>
        {deadline ? `Claim by ${formatDate(deadline, true)}. After that the creator can take back unclaimed prizes.` : 'Claim your prize below.'}
      </Callout>
      <FeeLedger
        lines={[
          { label: `${ordinal(position)} place prize`, value: `${formatUsdc(gross, 4)} USDC` },
          { label: 'Platform fee, 5%', value: `-${formatUsdc(fee, 4)} USDC`, muted: true },
          { label: 'You receive', value: `${formatUsdc(gross - fee, 4)} USDC`, total: true },
        ]}
      />
      <Button variant="primary" size="lg" className="w-full" loading={tx.pending} onClick={() => void claim()}>
        Claim {formatUsdc(gross - fee, 4)} USDC
      </Button>
      {tx.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tx.error}
        </p>
      )}
    </div>
  )
}

/** Lets the creator take back funds once the relevant waiting period has ended. */
export function ReclaimFunds({ bounty, submissionCount, now }: { bounty: BountyDetail; submissionCount: number; now: number }) {
  const tx = useTx()
  const refresh = useRefreshBounty()

  const approved = bounty.status === Status.Approved
  const deadline = new Date(bounty.deadline).getTime()
  const REVIEW = 7 * 24 * 3600 * 1000

  let availableAt: number
  if (approved) {
    availableAt = (bounty.approvedAt ? new Date(bounty.approvedAt).getTime() : now) + REVIEW
  } else {
    availableAt = submissionCount > 0 ? deadline + REVIEW : deadline
  }
  const ready = now > availableAt
  const amount = approved ? BigInt(bounty.unclaimedAmount) : BigInt(bounty.rewardAmount)

  const reclaim = async () => {
    try {
      await tx.board(approved ? 'refundAfterApproval' : 'refundBounty', [BigInt(bounty.onchainId)])
      await refresh(bounty.onchainId)
      toast.success(`${formatUsdc(amount, 4)} USDC returned to your wallet.`)
    } catch {
      // shown below
    }
  }

  return (
    <div className="space-y-3">
      {!ready && (
        <p className="text-sm text-mute">
          {approved
            ? `Winners have until ${formatDate(availableAt, true)} to claim. You can take back unclaimed prizes after that.`
            : submissionCount > 0
              ? `People submitted work, so you can reclaim the prize after the review period ends on ${formatDate(availableAt, true)}, or pick winners now.`
              : `You can reclaim the prize after the deadline, ${formatDate(availableAt, true)}.`}
        </p>
      )}
      {!approved && <p className="text-xs text-mute">The 0.5% fee paid when funding is not refunded.</p>}
      <Button variant={ready ? 'primary' : 'secondary'} className="w-full" disabled={!ready} loading={tx.pending} onClick={() => void reclaim()}>
        {approved ? 'Take back unclaimed prizes' : 'Reclaim the prize'} ({formatUsdc(amount, 4)} USDC)
      </Button>
      {tx.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tx.error}
        </p>
      )}
    </div>
  )
}

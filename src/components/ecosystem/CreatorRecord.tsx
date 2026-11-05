import { Skeleton, SourceBadge } from '@/components/ui/Feedback'
import { useCreatorRecord } from '@/lib/api/ecosystem'
import { formatUsdc } from '@/lib/money'

function Line({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5" title={hint}>
      <dt className="text-mute">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  )
}

/**
 * What a creator did with the bounties they funded, counted from the contract's own records. These are facts, not a
 * score: a contributor can see how often prizes were paid and how often they were taken back after work was submitted.
 */
export function CreatorRecord({ wallet, compact = false }: { wallet: string; compact?: boolean }) {
  const query = useCreatorRecord(wallet)
  if (query.isPending) return <Skeleton className="h-28 w-full" />
  if (query.isError || query.data.funded === 0) return null
  const r = query.data

  return (
    <section aria-label="Creator record" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold">Creator record</h3>
        <SourceBadge source="chain" />
      </div>
      <dl className="divide-y divide-line text-sm">
        <Line label="Bounties funded" value={`${r.funded} (${formatUsdc(r.fundedAmount)} USDC)`} />
        <Line label="Received submissions" value={r.receivedSubmissions} />
        <Line label="Picked winners" value={r.pickedWinners} hint="Bounties where the creator approved at least one winner." />
        <Line
          label="Reclaimed after submissions"
          value={r.reclaimedAfterSubmissions}
          hint="Prize taken back although contributors had submitted work."
        />
        {!compact && <Line label="Reclaimed with no submissions" value={r.reclaimedWithoutSubmissions} />}
        {r.disputesOpened > 0 && (
          <Line
            label="Disputes (upheld / opened)"
            value={`${r.disputesUpheld} / ${r.disputesOpened}`}
            hint="Contributors asked an admin to mediate. Recorded on BountyFi, not binding, and not on-chain."
          />
        )}
        <Line label="Waiting for a decision" value={r.awaitingDecision} hint="Deadline passed, submissions received, no winner picked yet." />
        <Line label="Paid to winners" value={`${formatUsdc(r.paidToWinners, 2)} USDC`} />
        <Line
          label="Median days to pick winners"
          value={r.medianDaysToPickWinners === null ? 'None yet' : r.medianDaysToPickWinners}
          hint="From the first submission to the winner selection."
        />
      </dl>
      <p className="text-xs text-mute">Counted from approved public bounties and contract events. It is a record, not a rating.</p>
    </section>
  )
}

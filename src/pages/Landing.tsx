import { Link } from 'react-router-dom'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { PrizeCalculator } from '@/components/bounty/PrizeCalculator'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { StatusBadge } from '@/components/bounty/StatusBadge'
import { useBounties, usePublicStats } from '@/lib/api/queries'
import { formatUsdc } from '@/lib/money'
import { timeLeft } from '@/lib/time'

function OpenNow() {
  const query = useBounties({ open: true, sort: 'newest', limit: 4 })
  const items = query.data?.items ?? []

  return (
    <section aria-labelledby="open-now" className="rounded-md border-2 border-ink bg-white shadow-hard">
      <div className="flex items-baseline justify-between border-b-2 border-ink px-5 py-3">
        <h2 id="open-now" className="font-display text-lg font-bold">
          Open for work right now
        </h2>
        <Link to="/explore" className="text-sm font-bold underline underline-offset-2">
          See all
        </Link>
      </div>

      {query.isPending ? (
        <ul aria-hidden className="divide-y divide-line">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2 px-5 py-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <div className="p-4">
          <ErrorState title="Bounties did not load" message="The list is temporarily unavailable." onRetry={() => void query.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="No bounties are open yet"
            action={
              <ButtonLink to="/create" variant="primary">
                Post the first bounty
              </ButtonLink>
            }
          >
            New bounties appear here once an admin has reviewed them.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((b) => (
            <li key={b.id}>
              <Link to={`/bounty/${b.onchainId}`} className="grid gap-3 px-5 py-4 hover:bg-signal-soft/50 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-1.5">
                  <StatusBadge status={b.status} deadline={b.deadline} />
                  <p className="line-clamp-2 font-display font-bold leading-snug">{b.title}</p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-mute">
                    <span>{timeLeft(b.deadline)}</span>
                    <span>
                      {b.submissionCount} {b.submissionCount === 1 ? 'submission' : 'submissions'}
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-4 sm:flex-col sm:items-end">
                  <p className="num font-display text-xl font-bold">{formatUsdc(b.rewardAmount)} USDC</p>
                  <PrizeLadder shares={b.prizeShares} compact />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Totals() {
  const stats = usePublicStats()
  const s = stats.data
  if (!s) return null
  const cells = [
    s.liveBounties > 0 && { label: 'Bounties live', value: String(s.liveBounties) },
    BigInt(s.totalPosted) > 0n && { label: 'USDC posted in prizes', value: formatUsdc(s.totalPosted) },
    BigInt(s.totalPaidOut) > 0n && { label: 'USDC paid to winners', value: formatUsdc(s.totalPaidOut) },
    s.builders > 0 && { label: 'Contributors who submitted', value: String(s.builders) },
  ].filter(Boolean) as { label: string; value: string }[]
  if (cells.length === 0) return null

  return (
    <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="bg-white px-5 py-4">
          <dd className="num font-display text-2xl font-bold">{c.value}</dd>
          <dt className="text-xs text-mute">{c.label}</dt>
        </div>
      ))}
    </dl>
  )
}

export default function Landing() {
  return (
    <div className="space-y-24">
      <section className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="space-y-6 pt-2">
          <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
            Fix open-source bugs. Get paid in USDC.
          </h1>
          <p className="max-w-xl text-lg text-mute">
            A maintainer locks the prize in a smart contract. Contributors submit fixes. The maintainer picks one winner or several, and each winner claims their share straight from the contract.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <ButtonLink to="/explore" variant="primary" size="lg">
              Browse open bounties
            </ButtonLink>
            <ButtonLink to="/create" size="lg">
              Post a bounty
            </ButtonLink>
          </div>
          <p className="max-w-md text-sm text-mute">
            Posting adds a 0.5% fee on top of the prize. Winners pay 5% of what they receive. Nothing else.
          </p>
        </div>
        <OpenNow />
      </section>

      <Totals />

      <section aria-labelledby="calc" className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <h2 id="calc" className="font-display text-2xl font-bold sm:text-4xl">
            Know what a payout is before you post
          </h2>
          <p className="text-mute">
            Prizes can go to one person, an equal split, or ranked places like 50 / 30 / 20. Every deduction is a fixed rate in the contract, so the numbers here are the numbers on-chain.
          </p>
          <p className="text-mute">
            If you pick fewer winners than places, the unused prizes return to you in the same transaction.
          </p>
        </div>
        <div className="rounded-md border-2 border-ink bg-white p-5 sm:p-6">
          <PrizeCalculator />
        </div>
      </section>

      <section aria-labelledby="flow" className="grid gap-x-16 gap-y-10 md:grid-cols-[3fr_2fr]">
        <div>
          <h2 id="flow" className="mb-5 font-display text-2xl font-bold">
            If you maintain a project
          </h2>
          <ol className="space-y-4">
            {[
              ['Describe the bug and how a fix will be judged.', 'The text is hashed and the hash goes on-chain, so it cannot be changed after contributors start work.'],
              ['Choose the deadline and how the prize is shared.', 'One winner, an equal split, or ranked places.'],
              ['Fund it.', 'The prize plus the 0.5% fee leaves your wallet. An admin reviews the bounty and publishes it.'],
              ['Pick the winners after the deadline, or earlier.', 'Winners claim within 7 days. Anything unclaimed can be reclaimed after that.'],
            ].map(([head, tail], i) => (
              <li key={head} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="num font-display text-xl font-bold text-mute">{i + 1}</span>
                <p>
                  <span className="font-bold">{head}</span> <span className="text-mute">{tail}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="mb-5 font-display text-2xl font-bold">If you want to earn</h2>
          <ol className="space-y-4">
            {[
              ['Find a funded bounty.', 'Every listed bounty has its prize already locked.'],
              ['Submit before the deadline.', 'One submission per bounty, recorded on-chain.'],
              ['Claim if you win.', 'Your share arrives in your wallet minus the 5% fee.'],
            ].map(([head, tail], i) => (
              <li key={head} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="num font-display text-xl font-bold text-mute">{i + 1}</span>
                <p>
                  <span className="font-bold">{head}</span> <span className="text-mute">{tail}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rounded-md border-2 border-ink bg-signal px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <p className="max-w-xl font-display text-2xl font-bold sm:text-4xl">An issue that has sat in your tracker for months is worth a prize.</p>
          <ButtonLink to="/create" variant="dark" size="lg">
            Post a bounty
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}

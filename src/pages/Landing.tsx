import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { PrizeCalculator } from '@/components/bounty/PrizeCalculator'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { StatusBadge } from '@/components/bounty/StatusBadge'
import { useCategories } from '@/lib/api/ecosystem'
import { useBounties, usePublicStats } from '@/lib/api/queries'
import { categoryIcon } from '@/lib/nav'
import { formatUsdc } from '@/lib/money'
import { timeLeft } from '@/lib/time'

function OpenNow() {
  const query = useBounties({ state: 'open', sort: 'newest', limit: 4 })
  const items = query.data?.items ?? []

  return (
    <section aria-labelledby="open-now" className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h2 id="open-now" className="font-display text-base font-semibold">
          Open for work right now
        </h2>
        <Link to="/explore" className="text-sm font-medium underline underline-offset-2">
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
              <Link to={`/bounty/${b.onchainId}`} className="grid gap-3 px-5 py-4 hover:bg-ink/[0.02] sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-1.5">
                  <StatusBadge status={b.status} deadline={b.deadline} />
                  <p className="line-clamp-2 font-display font-semibold leading-snug">{b.title}</p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-mute">
                    {b.projectName && <span className="font-medium text-ink">{b.projectName}</span>}
                    <span>{timeLeft(b.deadline)}</span>
                    <span>
                      {b.submissionCount} {b.submissionCount === 1 ? 'submission' : 'submissions'}
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-4 sm:flex-col sm:items-end">
                  <p className="num font-display text-xl font-semibold">{formatUsdc(b.rewardAmount)} USDC</p>
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

/** Platform totals. A figure is shown only when it is above zero, so nothing here is ever a placeholder. */
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
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface px-5 py-4">
          <dd className="num font-display text-2xl font-semibold">{c.value}</dd>
          <dt className="text-xs text-mute">{c.label}</dt>
        </div>
      ))}
    </dl>
  )
}

function Categories() {
  const query = useCategories()
  if (!query.data || query.data.length === 0) return null
  return (
    <section aria-labelledby="kinds" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="kinds" className="font-display text-2xl font-semibold sm:text-3xl">
            Work of every kind
          </h2>
          <p className="mt-1 max-w-xl text-mute">Anything with a clear outcome can carry a reward, not only code.</p>
        </div>
        <Link to="/categories" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2">
          All categories <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {query.data.map((c) => {
          const Icon = categoryIcon(c.icon)
          return (
            <li key={c.slug} className="bg-surface">
              <Link to={`/explore?category=${c.slug}`} className="flex h-full gap-3 p-4 transition-colors hover:bg-ink/[0.02]">
                <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-mute" />
                <span className="min-w-0">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block truncate text-sm text-mute">{c.examples.slice(0, 3).join(', ')}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const MODULES = [
  { to: '/projects', title: 'Project workspaces', body: 'A public page for every project with its open bounties, contributors and reward history.' },
  { to: '/explore', title: 'Milestones', body: 'Split a large bounty into reviewable pieces with their own descriptions and planned rewards.' },
  { to: '/workspace/teams', title: 'Team bounties', body: 'Assemble a team, assign roles and agree the split. The team settles payment between themselves.' },
  { to: '/workspace/projects', title: 'Recurring programs', body: 'Plan weekly or monthly work and publish each cycle as its own funded bounty.' },
  { to: '/submissions', title: 'Reviews', body: 'Comment, request revisions, approve or reject, with a full history for every submission.' },
]

export default function Landing() {
  return (
    <div className="space-y-20">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="space-y-6 pt-2">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-mute">
            <span aria-hidden className="size-1.5 rounded-full bg-signal-deep" /> On-chain work and contribution ecosystem
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Turn any problem into a reward.</h1>
          <p className="max-w-xl text-lg text-mute">
            Lock a USDC prize in a smart contract, let contributors submit work, review it, and pay the winners straight from the contract. For code, design, research, community and more.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <ButtonLink to="/explore" variant="primary" size="lg">
              Explore bounties
            </ButtonLink>
            <ButtonLink to="/create" size="lg">
              Post a bounty
            </ButtonLink>
          </div>
          <p className="max-w-md text-sm text-mute">Posting adds a 0.5% fee on top of the prize. Winners pay 5% of what they receive. Nothing else.</p>
        </div>
        <OpenNow />
      </section>

      <Totals />
      <Categories />

      <section aria-labelledby="flow" className="grid gap-x-16 gap-y-10 md:grid-cols-[3fr_2fr]">
        <div>
          <h2 id="flow" className="mb-5 font-display text-xl font-semibold">
            If you have work to fund
          </h2>
          <ol className="space-y-4">
            {[
              ['Describe the work and what counts as done.', 'The text is hashed and the hash goes on-chain, so it cannot be changed after contributors start.'],
              ['Set the prize, the deadline and how it is shared.', 'One winner, an equal split, or ranked places.'],
              ['Fund it.', 'The prize plus the 0.5% fee leaves your wallet. An admin reviews the bounty and publishes it.'],
              ['Review submissions and pick the winners.', 'Winners claim within 7 days. Anything unclaimed can be reclaimed after that.'],
            ].map(([head, tail], i) => (
              <li key={head} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="num font-display text-lg font-semibold text-mute">{i + 1}</span>
                <p>
                  <span className="font-medium">{head}</span> <span className="text-mute">{tail}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="mb-5 font-display text-xl font-semibold">If you want to earn</h2>
          <ol className="space-y-4">
            {[
              ['Find a funded bounty.', 'Every listed bounty has its prize already locked.'],
              ['Submit before the deadline.', 'Your submission is recorded on-chain, and the creator reviews it.'],
              ['Claim if you win.', 'Your share arrives in your wallet minus the 5% fee.'],
            ].map(([head, tail], i) => (
              <li key={head} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="num font-display text-lg font-semibold text-mute">{i + 1}</span>
                <p>
                  <span className="font-medium">{head}</span> <span className="text-mute">{tail}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="modules" className="space-y-5">
        <h2 id="modules" className="font-display text-2xl font-semibold sm:text-3xl">
          Built for more than one-off bounties
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <li key={m.title} className="bg-surface">
              <Link to={m.to} className="block h-full space-y-1 p-5 transition-colors hover:bg-ink/[0.02]">
                <span className="font-display font-semibold">{m.title}</span>
                <span className="block text-sm text-mute">{m.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="calc" className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <h2 id="calc" className="font-display text-2xl font-semibold sm:text-3xl">
            Know what a payout is before you post
          </h2>
          <p className="text-mute">
            Prizes can go to one person, an equal split, or ranked places like 50 / 30 / 20. Every deduction is a fixed rate in the contract, so the numbers here are the numbers on-chain.
          </p>
          <p className="text-mute">If you pick fewer winners than places, the unused prizes return to you in the same transaction.</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <PrizeCalculator />
        </div>
      </section>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { AddressChip } from '@/components/ui/Address'
import { ButtonLink } from '@/components/ui/Button'
import { Callout, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FeeLedger } from '@/components/bounty/FeeLedger'
import { useAdminOverview } from '@/lib/api/queries'
import { Status } from '@/lib/api/types'
import { formatUsdc } from '@/lib/money'

const STATUS_NAMES: Record<number, string> = {
  [Status.Open]: 'Awaiting funding',
  [Status.Funded]: 'Funded',
  [Status.Approved]: 'Winners picked',
  [Status.Claimed]: 'Paid out',
  [Status.Refunded]: 'Refunded',
  [Status.Cancelled]: 'Cancelled',
}

function Tile({ label, value, unit, to }: { label: string; value: string; unit?: string; to?: string }) {
  const body = (
    <>
      <p className="num font-display text-2xl font-semibold">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-mute">{unit}</span>}
      </p>
      <p className="text-xs text-mute">{label}</p>
    </>
  )
  return to ? (
    <Link to={to} className="block bg-white px-5 py-4 hover:bg-ink/5">
      {body}
    </Link>
  ) : (
    <div className="bg-white px-5 py-4">{body}</div>
  )
}

function Bars({ title, points, format }: { title: string; points: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...points.map((p) => p.value), 1)
  const total = points.reduce((s, p) => s + p.value, 0)
  return (
    <figure className="rounded-md border border-line bg-white p-5">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <span className="font-display font-semibold">{title}</span>
        <span className="num text-sm text-mute">{format(total)} in 14 days</span>
      </figcaption>
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`${title}, last 14 days: ${points.map((p) => `${p.label} ${format(p.value)}`).join(', ')}`}>
        {points.map((p, i) => (
          <div key={p.label} className="flex h-full flex-1 flex-col justify-end" title={`${p.label}: ${format(p.value)}`}>
            <div
              className={`w-full rounded-t-sm border border-ink ${i === points.length - 1 ? 'bg-signal' : 'bg-ink'}`}
              style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 4 : 1)}%`, opacity: p.value === 0 ? 0.15 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-mute">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </figure>
  )
}

export default function Overview() {
  const q = useAdminOverview()
  if (q.isError) return <ErrorState title="The overview did not load" onRetry={() => void q.refetch()} />
  if (q.isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-4" aria-busy>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    )
  }
  const o = q.data
  const post = o.revenue.byKind.find((k) => k.kind === 0)
  const claim = o.revenue.byKind.find((k) => k.kind === 1)
  const short = (day: string) => day.slice(5)

  return (
    <div className="space-y-8">
      {o.moderation.pending > 0 && (
        <Callout
          tone="warn"
          title={`${o.moderation.pending} ${o.moderation.pending === 1 ? 'bounty is' : 'bounties are'} waiting for review`}
          action={<ButtonLink to="/admin/review" variant="primary" size="sm">Open the review queue</ButtonLink>}
        >
          Nothing appears on the platform until you approve it.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
        <Tile label="Waiting for review" value={String(o.moderation.pending)} to="/admin/review" />
        <Tile label="Approved and public" value={String(o.moderation.approved)} to="/admin/bounties" />
        <Tile label="Rejected" value={String(o.moderation.rejected)} />
        <Tile label="On-chain, not published" value={String(o.moderation.unpublished)} />
        <Tile label="Users" value={String(o.people.users)} to="/admin/users" />
        <Tile label="New users, 7 days" value={String(o.people.new7d)} />
        <Tile label="Linked wallets" value={String(o.people.wallets)} />
        <Tile label="Submissions" value={String(o.work.submissions)} to="/admin/submissions" />
      </div>

      <section aria-labelledby="rev" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4 rounded-md border border-line bg-white p-5">
          <h2 id="rev" className="font-display text-xl font-semibold">
            Platform revenue
          </h2>
          <FeeLedger
            lines={[
              { label: 'Post fees, 0.5%', value: `${formatUsdc(post?.total ?? 0, 4)} USDC` },
              { label: 'Claim fees, 5%', value: `${formatUsdc(claim?.total ?? 0, 4)} USDC` },
              { label: 'All time', value: `${formatUsdc(o.revenue.total, 4)} USDC`, total: true },
              { label: 'Last 24 hours', value: `${formatUsdc(o.revenue.day, 4)} USDC`, muted: true },
              { label: 'Last 7 days', value: `${formatUsdc(o.revenue.week, 4)} USDC`, muted: true },
              { label: 'Last 30 days', value: `${formatUsdc(o.revenue.month, 4)} USDC`, muted: true },
            ]}
          />
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <p className="text-mute">Fee wallet</p>
            <AddressChip address={o.revenue.treasuryAddress} />
            <p className="num pt-1 font-semibold">
              {o.revenue.treasuryBalance !== null ? `${formatUsdc(o.revenue.treasuryBalance, 4)} USDC held` : 'Balance unavailable'}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <Bars
            title="Fees collected per day"
            points={o.series.revenue.map((d) => ({ label: short(d.day), value: Number(d.amount) / 1e6 }))}
            format={(n) => `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} USDC`}
          />
          <Bars
            title="Bounties created per day"
            points={o.series.bounties.map((d) => ({ label: short(d.day), value: d.count }))}
            format={(n) => String(n)}
          />
        </div>
      </section>

      <section aria-labelledby="states">
        <h2 id="states" className="mb-3 font-display text-xl font-semibold">
          Bounties by on-chain state
        </h2>
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Bounties grouped by on-chain state</caption>
            <thead>
              <tr className="border-b border-line bg-paper">
                <th scope="col" className="px-4 py-2 font-semibold">State</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Bounties</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Total prize pools</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.chainStatus.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-mute">No bounties have been indexed yet.</td>
                </tr>
              )}
              {o.chainStatus.map((s) => (
                <tr key={s.status}>
                  <td className="px-4 py-2.5">{STATUS_NAMES[s.status]}</td>
                  <td className="num px-4 py-2.5 text-right">{s.count}</td>
                  <td className="num px-4 py-2.5 text-right">{formatUsdc(s.reward)} USDC</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

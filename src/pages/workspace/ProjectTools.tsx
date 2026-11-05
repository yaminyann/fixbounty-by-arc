import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Badge, Callout, EmptyState, ErrorState, Section, Skeleton, SourceBadge, Stat, StatGrid } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Field, Input } from '@/components/ui/Form'
import { errorMessage } from '@/lib/api/client'
import { useAddWebhook, useDeleteWebhook, useProjectAnalytics, useProjectWebhooks } from '@/lib/api/collab'
import { formatUsdc } from '@/lib/money'
import { timeAgo } from '@/lib/time'

const EVENT_LABEL: Record<string, string> = {
  bounty_live: 'Bounty goes live',
  submission: 'New submission',
  winners_picked: 'Winners picked',
  reward_claimed: 'Prize claimed',
}

export function IntegrationsPanel({ slug }: { slug: string }) {
  const query = useProjectWebhooks(slug)
  const add = useAddWebhook()
  const remove = useDeleteWebhook()
  const { confirm, dialog } = useConfirm()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['bounty_live', 'submission', 'winners_picked', 'reward_claimed'])
  const [error, setError] = useState<string | null>(null)

  const toggle = (e: string) => setEvents((list) => (list.includes(e) ? list.filter((x) => x !== e) : [...list, e]))

  const submit = async () => {
    setError(null)
    if (events.length === 0) return setError('Choose at least one event.')
    try {
      const res = await add.mutateAsync({ slug, url: url.trim(), events })
      setUrl('')
      if (res.testDelivered) toast.success('Webhook added. A test message was sent.')
      else toast.warning('Webhook added, but the test message did not arrive. Check the address.')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const drop = async (id: string) => {
    const ok = await confirm({ title: 'Remove this webhook?', description: 'It stops receiving events immediately.', confirmLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await remove.mutateAsync({ slug, id })
      toast.success('Webhook removed.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <Callout title="Send project events to your chat">
        Discord, Slack and Telegram webhook addresses only. Each event is one line of text with a link, sent after it is confirmed on-chain. See <Link className="font-semibold underline" to="/developers">Developers</Link> for the format.
      </Callout>

      <form
        className="space-y-4 rounded-lg border border-line bg-surface p-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Webhook address" hint="For example https://discord.com/api/webhooks/…">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Events</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {Object.entries(EVENT_LABEL).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-ink" checked={events.includes(key)} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={add.isPending}>
          Add webhook
        </Button>
      </form>

      {query.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : query.isError ? (
        <ErrorState title="Webhooks did not load" onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="No webhooks yet">Add one above to receive events.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {query.data.items.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 space-y-1">
                <p className="num truncate text-sm font-medium">{w.host}</p>
                <div className="flex flex-wrap gap-1.5">
                  {w.events.map((e) => (
                    <Badge key={e}>{EVENT_LABEL[e] ?? e}</Badge>
                  ))}
                </div>
                <p className="text-xs text-mute">
                  {w.lastDeliveryAt ? `Last sent ${timeAgo(w.lastDeliveryAt)}` : 'Nothing sent yet'}
                  {w.lastError ? ` · ${w.lastError}` : ''}
                </p>
              </div>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={() => void drop(w.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  )
}

const duration = (hours: number | null) => (hours === null ? 'No data yet' : hours < 48 ? `${hours} h` : `${(hours / 24).toFixed(1)} days`)

export function AnalyticsPanel({ slug }: { slug: string }) {
  const query = useProjectAnalytics(slug)
  if (query.isPending) return <Skeleton className="h-64 w-full" />
  if (query.isError) return <ErrorState title="Analytics did not load" onRetry={() => void query.refetch()} />
  const a = query.data
  const peak = Math.max(...a.weekly.map((w) => w.submissions), 1)
  const rate = a.withSubmissions > 0 ? `${a.withWinners} of ${a.withSubmissions}` : 'None yet'

  return (
    <div className="space-y-8">
      <p className="text-sm text-mute">Counted from this project's funded bounties, indexed contract events and review records. Nothing here is estimated.</p>

      <StatGrid>
        <Stat label="Bounties funded" value={a.bounties} hint={`${formatUsdc(a.funded)} USDC`} />
        <Stat label="Submissions received" value={a.submissions} hint={a.bounties > 0 ? `${(a.submissions / a.bounties).toFixed(1)} per bounty` : undefined} />
        <Stat label="Picked winners" value={rate} hint="Bounties with submissions" />
        <Stat label="Paid to winners" value={formatUsdc(a.distributed, 2)} unit="USDC" hint={<SourceBadge source="chain" />} />
      </StatGrid>

      <StatGrid>
        <Stat label="First submission arrives" value={duration(a.medianHoursToFirstSubmission)} hint="Median, after funding" />
        <Stat label="Submissions get reviewed" value={duration(a.medianReviewHours)} hint={`Median, ${a.reviewedSubmissions} reviewed`} />
        <Stat label="Winners picked" value={a.medianDaysToPickWinners === null ? 'No data yet' : `${a.medianDaysToPickWinners} days`} hint="Median, after first submission" />
        <Stat label="Reclaimed" value={a.reclaimed} hint="Prizes taken back" />
      </StatGrid>

      <Section title="Submissions per week" description="Last 12 weeks, from on-chain submissions.">
        <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Submissions per week">
          {a.weekly.map((w) => (
            <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${w.week}: ${w.submissions} submissions, ${formatUsdc(w.paid, 2)} USDC paid`}>
              <span className="num text-xs text-mute">{w.submissions || ''}</span>
              <span className="w-full rounded-t bg-ink" style={{ height: `${Math.max((w.submissions / peak) * 100, w.submissions ? 6 : 1.5)}%`, opacity: w.submissions ? 1 : 0.15 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-mute">
          <span>{a.weekly[0]?.week}</span>
          <span>{a.weekly[a.weekly.length - 1]?.week}</span>
        </div>
      </Section>

      <Section title="By category">
        {a.categories.length === 0 ? (
          <p className="text-sm text-mute">No funded bounties yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
            {a.categories.map((c) => (
              <li key={c.category} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">{c.category}</span>
                <span className="text-mute">
                  {c.bounties} {c.bounties === 1 ? 'bounty' : 'bounties'} · {c.submissions} submissions · <span className="num text-ink">{formatUsdc(c.paid, 2)} USDC</span> paid
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

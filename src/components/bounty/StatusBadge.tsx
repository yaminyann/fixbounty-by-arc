import { Badge } from '@/components/ui/Feedback'
import { Status, type Moderation } from '@/lib/api/types'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'ink' | 'signal'

export function describeStatus(status: Status, deadline: string | number | Date, now = Date.now()): { label: string; tone: Tone } {
  const past = new Date(deadline).getTime() <= now
  switch (status) {
    case Status.Open:
      return { label: 'Awaiting funding', tone: 'warn' }
    case Status.Funded:
      return past ? { label: 'In review', tone: 'info' } : { label: 'Open for work', tone: 'ok' }
    case Status.Approved:
      return { label: 'Winners picked', tone: 'info' }
    case Status.Claimed:
      return { label: 'Paid out', tone: 'ink' }
    case Status.Refunded:
      return { label: 'Refunded', tone: 'neutral' }
    case Status.Cancelled:
      return { label: 'Cancelled', tone: 'neutral' }
  }
}

export function StatusBadge({ status, deadline, now }: { status: Status; deadline: string | number | Date; now?: number }) {
  const { label, tone } = describeStatus(status, deadline, now)
  return <Badge tone={tone}>{label}</Badge>
}

const MODERATION: Record<Moderation, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting for approval', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

export function ModerationBadge({ status }: { status: Moderation }) {
  const { label, tone } = MODERATION[status]
  return <Badge tone={tone}>{label}</Badge>
}

import { createElement } from 'react'
import { Badge } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import type { Difficulty, ReviewStatus } from '@/lib/api/types'
import type { Cadence, MilestoneStatus } from '@/lib/api/ecosystem'
import { categoryIcon } from '@/lib/nav'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'ink' | 'signal'

const REVIEW: Record<ReviewStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Awaiting review', tone: 'info' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Not accepted', tone: 'danger' },
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const { label, tone } = REVIEW[status]
  return <Badge tone={tone}>{label}</Badge>
}

const MILESTONE: Record<MilestoneStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'info' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
}

export function MilestoneBadge({ status }: { status: MilestoneStatus }) {
  const { label, tone } = MILESTONE[status]
  return <Badge tone={tone}>{label}</Badge>
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <Badge>{DIFFICULTY_LABEL[difficulty]}</Badge>
}

export const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly' }

export function CategoryChip({ slug, name, icon, className }: { slug?: string | null; name?: string; icon?: string; className?: string }) {
  if (!slug) return null
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-mute', className)}>
      {createElement(categoryIcon(icon ?? slug), { size: 13, 'aria-hidden': true })}
      {name ?? slug}
    </span>
  )
}

export function ProjectAvatar({ name, logoUrl, size = 28 }: { name: string; logoUrl?: string | null; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return logoUrl ? (
    <img src={logoUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-md border border-line bg-surface object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-md bg-ink font-display text-sm font-semibold text-white" style={{ width: size, height: size }}>
      {initial}
    </span>
  )
}

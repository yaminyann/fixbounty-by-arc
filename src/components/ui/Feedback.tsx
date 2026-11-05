import type { ComponentType, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideProps } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-ink/[0.06]', className)} />
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'ink' | 'signal'

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface text-mute',
  ok: 'border-ok/20 bg-ok-soft text-ok',
  warn: 'border-warn/20 bg-warn-soft text-warn',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
  ink: 'border-ink bg-ink text-white',
  signal: 'border-signal-deep/40 bg-signal text-ink',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

const CALLOUT_STYLES = {
  info: { box: 'border-info/20 bg-info-soft/60', icon: Info, color: 'text-info' },
  warn: { box: 'border-warn/25 bg-warn-soft/70', icon: AlertTriangle, color: 'text-warn' },
  danger: { box: 'border-danger/25 bg-danger-soft/70', icon: XCircle, color: 'text-danger' },
  ok: { box: 'border-ok/25 bg-ok-soft/70', icon: CheckCircle2, color: 'text-ok' },
} as const

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof CALLOUT_STYLES
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const style = CALLOUT_STYLES[tone]
  const Icon = style.icon
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4', style.box, className)}>
      <Icon size={18} aria-hidden className={cn('mt-0.5 shrink-0', style.color)} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="text-sm font-semibold text-ink">{title}</p>}
        {children && <div className="text-sm text-ink/80">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
  icon: Icon,
  className,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  icon?: ComponentType<LucideProps>
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-ink/5 text-mute">
          <Icon size={20} aria-hidden />
        </span>
      )}
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-sm text-mute">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'This did not load', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/25 bg-danger-soft/60 px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold text-danger">{title}</p>
      {message && <p className="mx-auto mt-1.5 max-w-md text-sm text-ink/80">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-9 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:border-ink/30"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function PageHeader({ title, children, actions, className }: { title: string; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {children && <p className="mt-1.5 max-w-2xl text-sm text-mute sm:text-base">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** A labelled block of a page. Keeps headings consistent without wrapping everything in cards. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-mute">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** One number with its label. Used in dashboard strips; the parent supplies the grid and dividers. */
export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: 'warn' }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <p className="text-xs text-mute">{label}</p>
      <p className={cn('num mt-1 font-display text-2xl font-semibold leading-none', tone === 'warn' && 'text-warn')}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-mute">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-xs text-mute">{hint}</p>}
    </div>
  )
}

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border border-line bg-line',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 md:grid-cols-3',
        columns === 4 && 'grid-cols-2 md:grid-cols-4',
      )}
    >
      {children}
    </div>
  )
}

/** Tells the reader whether a number can be checked on-chain or is a BountyFi record. */
export function SourceBadge({ source, className }: { source: 'chain' | 'platform'; className?: string }) {
  return source === 'chain' ? (
    <span
      title="Read from contract events on Arc. Anyone can verify it on the explorer."
      className={cn('inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-xs font-medium text-ok', className)}
    >
      <CheckCircle2 size={12} aria-hidden /> Verified on-chain
    </span>
  ) : (
    <span
      title="Recorded by BountyFi. It is not stored on the blockchain."
      className={cn('inline-flex items-center gap-1 rounded-md bg-ink/5 px-1.5 py-0.5 text-xs font-medium text-mute', className)}
    >
      Recorded on BountyFi
    </span>
  )
}

import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
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
  return <div aria-hidden className={cn('relative overflow-hidden rounded bg-line/70', className)}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
  </div>
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'ink' | 'signal'

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-white text-mute',
  ok: 'border-ok/30 bg-ok-soft text-ok',
  warn: 'border-warn/30 bg-warn-soft text-warn',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  info: 'border-info/30 bg-info-soft text-info',
  ink: 'border-ink bg-ink text-white',
  signal: 'border-ink bg-signal text-ink',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-bold', TONES[tone], className)}>
      {children}
    </span>
  )
}

const CALLOUT_STYLES = {
  info: { box: 'border-info/40 bg-info-soft', icon: Info, color: 'text-info' },
  warn: { box: 'border-warn/40 bg-warn-soft', icon: AlertTriangle, color: 'text-warn' },
  danger: { box: 'border-danger/40 bg-danger-soft', icon: XCircle, color: 'text-danger' },
  ok: { box: 'border-ok/40 bg-ok-soft', icon: CheckCircle2, color: 'text-ok' },
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
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md border p-4', style.box, className)}>
      <Icon size={18} aria-hidden className={cn('mt-0.5 shrink-0', style.color)} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-bold text-ink">{title}</p>}
        {children && <div className="text-sm text-ink/80">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border border-dashed border-mute/50 bg-white px-6 py-12 text-center', className)}>
      <p className="font-display text-xl font-bold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-mute">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'This did not load', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border-2 border-danger/50 bg-danger-soft px-6 py-10 text-center">
      <p className="font-display text-xl font-bold text-danger">{title}</p>
      {message && <p className="mx-auto mt-2 max-w-md text-sm text-ink/80">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-10 items-center rounded border-2 border-ink bg-white px-4 text-sm font-bold hover:bg-signal-soft"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold sm:text-4xl">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-mute">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface LedgerLine {
  label: ReactNode
  value: ReactNode
  /** Visually separates the closing line. */
  total?: boolean
  muted?: boolean
}

/** Itemised money lines: label, dotted leader, amount. */
export function FeeLedger({ lines, className }: { lines: LedgerLine[]; className?: string }) {
  return (
    <dl className={cn('space-y-2', className)}>
      {lines.map((line, i) => (
        <div key={i} className={cn('ledger-line text-sm', line.total && 'mt-3 border-t border-line pt-3 text-base font-semibold', line.muted && 'text-mute')}>
          <dt>{line.label}</dt>
          <span className="leader" aria-hidden />
          <dd className="num text-right">{line.value}</dd>
        </div>
      ))}
    </dl>
  )
}

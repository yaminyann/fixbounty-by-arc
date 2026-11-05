import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

interface TabItem<T extends string> {
  value: T
  label: string
  count?: number
}

const TAB_BASE = 'relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors'
const TAB_ACTIVE = 'border-ink text-ink'
const TAB_IDLE = 'border-transparent text-mute hover:text-ink'

function Count({ n, active }: { n: number; active: boolean }) {
  return <span className={cn('num rounded-full px-1.5 text-xs', active ? 'bg-ink text-white' : 'bg-ink/5 text-mute')}>{n}</span>
}

/** Tab strip for in-page views. Uses buttons with real tab semantics. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line', className)}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={active}
            aria-controls={`panel-${item.value}`}
            onClick={() => onChange(item.value)}
            className={cn(TAB_BASE, active ? TAB_ACTIVE : TAB_IDLE)}
          >
            {item.label}
            {item.count !== undefined && <Count n={item.count} active={active} />}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="pt-6">
      {children}
    </div>
  )
}

/** Compact single-choice filter. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-md bg-ink/5 p-0.5">
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'h-8 rounded px-3 text-sm font-medium transition-colors',
              active ? 'bg-surface text-ink shadow-card' : 'text-mute hover:text-ink',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/** Route-based tab strip (each tab is its own URL). */
export function RouteTabs({ items, label }: { items: { to: string; label: string; end?: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn(TAB_BASE, isActive ? TAB_ACTIVE : TAB_IDLE)}>
          {({ isActive }) => (
            <>
              {item.label}
              {item.count !== undefined && item.count > 0 && <Count n={item.count} active={isActive} />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

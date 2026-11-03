import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

interface TabItem<T extends string> {
  value: T
  label: string
  count?: number
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
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto overflow-y-hidden border-b-2 border-ink', className)}>
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
            className={cn(
              '-mb-[2px] flex items-center gap-2 whitespace-nowrap rounded-t border-2 border-b-0 px-4 py-2 text-sm font-bold transition-colors',
              active ? 'border-ink bg-signal text-ink' : 'border-transparent text-mute hover:bg-white hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded px-1.5 text-xs', active ? 'bg-ink text-white' : 'bg-line text-ink')}>{item.count}</span>
            )}
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
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded border-2 border-ink bg-white">
      {items.map((item, i) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'h-9 px-3 text-sm font-bold transition-colors',
              i > 0 && 'border-l-2 border-ink',
              active ? 'bg-ink text-white' : 'hover:bg-signal-soft',
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
export function RouteTabs({ items, label }: { items: { to: string; label: string; end?: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b-2 border-ink">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              '-mb-[2px] whitespace-nowrap rounded-t border-2 border-b-0 px-4 py-2 text-sm font-bold transition-colors',
              isActive ? 'border-ink bg-signal text-ink' : 'border-transparent text-mute hover:bg-white hover:text-ink',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

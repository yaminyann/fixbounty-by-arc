import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PaginationProps {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
  className?: string
}

/** Compact numbered pager. Server driven: it only knows total, limit and the current offset. */
export function Pagination({ total, limit, offset, onChange, className }: PaginationProps) {
  const pages = Math.max(Math.ceil(total / limit), 1)
  if (pages <= 1) return null
  const current = Math.floor(offset / limit) + 1

  const numbers: (number | 'gap')[] = []
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - current) <= 1) numbers.push(p)
    else if (numbers[numbers.length - 1] !== 'gap') numbers.push('gap')
  }

  const go = (page: number) => onChange((page - 1) * limit)
  const first = offset + 1
  const last = Math.min(offset + limit, total)

  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-mute">
        Showing <span className="num font-semibold text-ink">{first}</span> to <span className="num font-semibold text-ink">{last}</span> of{' '}
        <span className="num font-semibold text-ink">{total}</span>
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current === 1}
            aria-label="Previous page"
            className="grid size-9 place-items-center rounded border border-line bg-white hover:bg-ink/5 disabled:opacity-40"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
        </li>
        {numbers.map((n, i) =>
          n === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-mute">
              …
            </li>
          ) : (
            <li key={n}>
              <button
                type="button"
                onClick={() => go(n)}
                aria-current={n === current ? 'page' : undefined}
                className={cn(
                  'num size-9 rounded border-2 text-sm font-semibold',
                  n === current ? 'border-ink bg-ink text-white' : 'border-transparent hover:border-ink hover:bg-white',
                )}
              >
                {n}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current === pages}
            aria-label="Next page"
            className="grid size-9 place-items-center rounded border border-line bg-white hover:bg-ink/5 disabled:opacity-40"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </li>
      </ul>
    </nav>
  )
}

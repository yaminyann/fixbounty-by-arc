import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
  align?: 'right'
}

interface DataTableProps<T> {
  caption: string
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading: boolean
  error: boolean
  onRetry: () => void
  emptyTitle: string
  emptyHint?: string
  page?: { total: number; limit: number; offset: number; onChange: (offset: number) => void }
  dimmed?: boolean
}

/** Scrollable admin table with built-in loading, empty and error states and optional pagination. */
export function DataTable<T>({ caption, columns, rows, rowKey, loading, error, onRetry, emptyTitle, emptyHint, page, dimmed }: DataTableProps<T>) {
  if (error) return <ErrorState title="This table did not load" onRetry={onRetry} />
  if (loading) {
    return (
      <div className="space-y-px" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>

  return (
    <div className="space-y-4">
      <div className={cn('overflow-x-auto rounded-md border border-line bg-white transition-opacity', dimmed && 'opacity-60')}>
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-paper">
              {columns.map((c) => (
                <th key={c.header} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 font-semibold', c.align === 'right' && 'text-right', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="align-top hover:bg-ink/[0.03]">
                {columns.map((c) => (
                  <td key={c.header} className={cn('px-4 py-3', c.align === 'right' && 'text-right', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && <Pagination total={page.total} limit={page.limit} offset={page.offset} onChange={page.onChange} />}
    </div>
  )
}

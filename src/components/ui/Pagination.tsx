import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems?: number
  pageSize?: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  className?: string
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1 && (!totalItems || totalItems <= (pageSize || 10))) {
    return null
  }

  // Generate page numbers to display with smart ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      if (start > 2) pages.push('...')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  const startItem = totalItems !== undefined && pageSize ? (currentPage - 1) * pageSize + 1 : undefined
  const endItem =
    totalItems !== undefined && pageSize
      ? Math.min(currentPage * pageSize, totalItems)
      : undefined

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t-2 border-black/10 text-xs ${className}`}
    >
      {/* Item range count */}
      {totalItems !== undefined && startItem !== undefined && endItem !== undefined ? (
        <div className="text-gray-600 font-medium">
          Showing <span className="font-bold text-black tabular-nums">{startItem}</span> to{' '}
          <span className="font-bold text-black tabular-nums">{endItem}</span> of{' '}
          <span className="font-bold text-black tabular-nums">{totalItems}</span> entries
        </div>
      ) : (
        <div className="text-gray-600 font-medium">
          Page <span className="font-bold text-black tabular-nums">{currentPage}</span> of{' '}
          <span className="font-bold text-black tabular-nums">{totalPages}</span>
        </div>
      )}

      {/* Controls & Page buttons */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {/* Page size selector */}
        {onPageSizeChange && pageSize && (
          <div className="flex items-center gap-1.5 mr-2">
            <span className="text-gray-500 font-bold">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="border-2 border-black bg-white px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-yellow-400"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="border-2 border-black p-1.5 bg-white hover:bg-yellow-300 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          title="First Page"
          aria-label="First page"
        >
          <ChevronsLeft size={14} />
        </button>

        {/* Prev Page */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="border-2 border-black p-1.5 bg-white hover:bg-yellow-300 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          title="Previous Page"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Numbered page pills */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 font-bold">
                  …
                </span>
              )
            }
            const isActive = p === currentPage
            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`min-w-7 h-7 px-1.5 border-2 border-black text-xs font-bold transition-all shadow-[2px_2px_0px_black] ${
                  isActive
                    ? 'bg-black text-white'
                    : 'bg-white hover:bg-yellow-300 text-black active:translate-x-0.5 active:translate-y-0.5'
                }`}
              >
                {p}
              </button>
            )
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="border-2 border-black p-1.5 bg-white hover:bg-yellow-300 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          title="Next Page"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="border-2 border-black p-1.5 bg-white hover:bg-yellow-300 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          title="Last Page"
          aria-label="Last page"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )
}

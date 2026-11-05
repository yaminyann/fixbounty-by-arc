import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Modal built on the native <dialog>: the browser traps focus, makes the page inert and
 * closes it on Escape, so keyboard behaviour is correct without extra code.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby={titleId}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]',
        size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-sm' : 'max-w-md',
      )}
    >
      {open && (
        <div className="animate-dialog-in">
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-mute">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-mute hover:bg-ink/5 hover:text-ink"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {children && <div className="max-h-[70dvh] overflow-y-auto px-5 pb-5 pt-1">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

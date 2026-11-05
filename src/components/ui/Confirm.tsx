import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

interface ConfirmOptions {
  title: string
  description?: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Use for actions that cannot be undone. */
  danger?: boolean
}

/**
 * Promise-based confirmation modal. Replaces `window.confirm`:
 *
 *   const { confirm, dialog } = useConfirm()
 *   if (await confirm({ title: 'Remove milestone?', danger: true })) ...
 *   return <>{dialog}</>
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setOptions(next)
      }),
    [],
  )

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const dialog = (
    <Dialog
      open={options !== null}
      onClose={() => settle(false)}
      title={options?.title ?? ''}
      description={options?.description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {options?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {options?.body}
    </Dialog>
  )

  return { confirm, dialog }
}

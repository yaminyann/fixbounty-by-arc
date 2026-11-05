import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { post, errorMessage } from '@/lib/api/client'
import { useAppConfig } from '@/lib/api/queries'

interface OnrampSession {
  url: string
  expiresAt: string | null
}

/**
 * Buy USDC with a card or bank through Circle's hosted checkout. The server starts the session for the account's own
 * linked wallet; the payment and identity checks happen on Circle's page and the USDC is sent straight to that wallet.
 * It is shown only when the deployment has an Onramp key. The balance on this page updates after Circle confirms.
 */
export function BuyUsdc() {
  const config = useAppConfig()
  const [link, setLink] = useState<string | null>(null)
  const start = useMutation({
    mutationFn: () => post<OnrampSession>('/me/onramp/session'),
  })

  if (!config.data?.onramp) return null

  const begin = async () => {
    // Open the tab inside the click so the browser allows it, then point it at Circle once the session exists.
    const popup = window.open('', '_blank')
    try {
      const session = await start.mutateAsync()
      setLink(session.url)
      if (popup) popup.location.href = session.url
    } catch {
      popup?.close()
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" loading={start.isPending} onClick={() => void begin()}>
        Buy USDC with a card or bank
      </Button>
      {link && (
        <p className="text-xs text-mute">
          Circle's checkout opened in a new tab.{' '}
          <a className="inline-flex items-center gap-1 font-semibold underline" href={link} target="_blank" rel="noopener noreferrer">
            Open it again <ExternalLink size={12} aria-hidden />
          </a>
        </p>
      )}
      {start.isError && (
        <p role="alert" className="text-xs font-medium text-danger">
          {errorMessage(start.error)}
        </p>
      )}
      <p className="text-xs text-mute">Circle runs the payment and sends the USDC to your linked wallet. BountyFi never sees your card.</p>
    </div>
  )
}

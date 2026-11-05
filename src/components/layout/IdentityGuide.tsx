import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useIdentity, type IdentityStatus } from '@/contexts/IdentityContext'
import { shortAddress } from '@/lib/money'

const COPY: Partial<Record<IdentityStatus, { title: string; body: string }>> = {
  needs_google: {
    title: 'Sign in with Google to finish setup',
    body: 'Your wallet is connected. BountyFi ties every wallet to a Google account, so each action can be traced to one person.',
  },
  needs_wallet: {
    title: 'Connect your wallet to finish setup',
    body: 'You are signed in. Connect the wallet you want to post bounties, submit work and receive payouts with.',
  },
  needs_link: {
    title: 'Link your wallet to your account',
    body: 'Sign one free message to prove this wallet is yours. It is not a transaction and costs nothing.',
  },
  wallet_mismatch: {
    title: 'This is not the wallet linked to your account',
    body: 'Switch back to the linked wallet in your wallet app, or link the one you have connected now.',
  },
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className={`grid size-5 place-items-center rounded-full border border-line ${done ? 'bg-signal' : 'bg-white'}`}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </span>
      <span className={done ? 'font-medium' : 'text-mute'}>{label}</span>
    </li>
  )
}

/** Opens by itself after one side of the identity is connected, until the other side and the link are done. */
export function IdentityGuide() {
  const id = useIdentity()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState<string | null>(() => sessionStorage.getItem('fb.guide'))

  const copy = COPY[id.status]
  const key = `${id.status}:${id.address ?? ''}`
  // Admin tools only need Google, so the wallet prompt stays out of the way there.
  const open = Boolean(copy) && dismissed !== key && !pathname.startsWith('/admin')

  const dismiss = () => {
    sessionStorage.setItem('fb.guide', key)
    setDismissed(key)
  }

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title={copy?.title ?? ''}
      description={copy?.body}
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          {id.status === 'needs_google' && (
            <Button variant="primary" onClick={() => void id.signInWithGoogle()}>
              Sign in with Google
            </Button>
          )}
          {id.status === 'needs_wallet' && (
            <Button
              variant="primary"
              onClick={() => {
                dismiss()
                id.connectWallet()
              }}
            >
              Connect wallet
            </Button>
          )}
          {(id.status === 'needs_link' || id.status === 'wallet_mismatch') && (
            <Button variant="primary" loading={id.busy} onClick={() => void id.linkWallet()}>
              {id.status === 'wallet_mismatch' ? `Link ${id.address ? shortAddress(id.address) : 'this wallet'}` : 'Sign and link'}
            </Button>
          )}
        </>
      }
    >
      <ol className="space-y-3 text-sm">
        <Step done={id.status !== 'needs_wallet' && id.status !== 'none'} label="Wallet connected" />
        <Step done={id.status !== 'needs_google' && id.status !== 'none'} label="Google account signed in" />
        <Step done={false} label="Wallet linked to your account" />
      </ol>
      {id.error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {id.error}
        </p>
      )}
    </Dialog>
  )
}

import type { ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useIdentity } from '@/contexts/IdentityContext'
import { Button } from '@/components/ui/Button'
import { Callout, Spinner } from '@/components/ui/Feedback'
import { appChain } from '@/lib/chain'
import { shortAddress } from '@/lib/money'

/**
 * Renders `children` only when a Google account, a connected wallet, their signed link and the right
 * network are all in place. Otherwise it shows the single next step instead of a dead control.
 */
export function RequireIdentity({ children, purpose = 'continue' }: { children: ReactNode; purpose?: string }) {
  const id = useIdentity()
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (id.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-mute">
        <Spinner size={18} /> Checking your account
      </div>
    )
  }

  if (id.status === 'ready') {
    if (isConnected && chainId !== appChain.id) {
      return (
        <Callout
          tone="warn"
          title={`Switch to ${appChain.name}`}
          action={
            <Button size="sm" variant="primary" loading={isPending} onClick={() => switchChain({ chainId: appChain.id })}>
              Switch network
            </Button>
          }
        >
          Your wallet is on another network.
        </Callout>
      )
    }
    return <>{children}</>
  }

  const steps: Record<Exclude<typeof id.status, 'ready' | 'loading'>, { title: string; body: string; action: ReactNode }> = {
    none: {
      title: `Connect your wallet and sign in to ${purpose}`,
      body: 'FixBounty needs a Google account and a wallet linked together.',
      action: (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={id.connectWallet}>
            Connect wallet
          </Button>
          <Button onClick={() => void id.signInWithGoogle()}>Sign in with Google</Button>
        </div>
      ),
    },
    needs_google: {
      title: `Sign in with Google to ${purpose}`,
      body: 'Your wallet is connected. Add your Google account so the two can be linked.',
      action: (
        <Button variant="primary" onClick={() => void id.signInWithGoogle()}>
          Sign in with Google
        </Button>
      ),
    },
    needs_wallet: {
      title: `Connect your wallet to ${purpose}`,
      body: 'You are signed in with Google. Connect the wallet you want to use.',
      action: (
        <Button variant="primary" onClick={id.connectWallet}>
          Connect wallet
        </Button>
      ),
    },
    needs_link: {
      title: 'Link your wallet to your account',
      body: 'Sign one free message to prove the wallet is yours. It is not a transaction.',
      action: (
        <Button variant="primary" loading={id.busy} onClick={() => void id.linkWallet()}>
          Sign and link wallet
        </Button>
      ),
    },
    wallet_mismatch: {
      title: 'Use the wallet linked to your account',
      body: `Your account is linked to ${id.linkedWallet ? shortAddress(id.linkedWallet) : 'another wallet'}, but ${id.address ? shortAddress(id.address) : 'a different wallet'} is connected. Switch wallets, or link the connected one instead.`,
      action: (
        <Button variant="primary" loading={id.busy} onClick={() => void id.linkWallet()}>
          Link connected wallet
        </Button>
      ),
    },
  }

  const step = steps[id.status]
  return (
    <div className="space-y-3">
      <Callout tone="info" title={step.title} action={step.action}>
        {step.body}
      </Callout>
      {id.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {id.error}
        </p>
      )}
    </div>
  )
}

import { Suspense, type ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useAuth } from '@/contexts/AuthContext'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { IdentityGuide } from '@/components/layout/IdentityGuide'
import { WalletDialog } from '@/components/layout/WalletDialog'
import { Button } from '@/components/ui/Button'
import { Callout, Spinner } from '@/components/ui/Feedback'
import { appChain } from '@/lib/chain'
import { useAppConfig } from '@/lib/api/queries'

function NetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  if (!isConnected || chainId === appChain.id) return null
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Callout
        tone="warn"
        title={`Your wallet is on a different network`}
        action={
          <Button size="sm" variant="primary" loading={isPending} onClick={() => switchChain({ chainId: appChain.id })}>
            Switch to {appChain.name}
          </Button>
        }
      >
        Transactions only work on {appChain.name}. Switch networks in your wallet to continue.
      </Callout>
    </div>
  )
}

function ContractNotice() {
  const config = useAppConfig()
  if (!config.data || config.data.contractAddress) return null
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Callout tone="warn" title="The bounty contract is not configured yet">
        Posting and claiming are paused until the contract address is set on the server.
      </Callout>
    </div>
  )
}

function AuthNotice() {
  const { error } = useAuth()
  if (!error) return null
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Callout tone="danger">{error}</Callout>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:border-2 focus:border-ink focus:bg-signal focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>
      <div className="bg-ink px-4 py-1 text-center text-xs text-white/85">
        {appChain.testnet ? 'Arc Testnet. All USDC here is test money with no real value.' : `Connected to ${appChain.name}`}
      </div>
      <Header />
      <NetworkBanner />
      <ContractNotice />
      <AuthNotice />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        <Suspense
          fallback={
            <div className="grid place-items-center py-24">
              <Spinner size={28} />
            </div>
          }
        >
          {children}
        </Suspense>
      </main>
      <Footer />
      <IdentityGuide />
      <WalletDialog />
    </div>
  )
}

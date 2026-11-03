import { useEffect, useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/Feedback'
import { useIdentity } from '@/contexts/IdentityContext'

/**
 * Wallet picker. Browser wallets are discovered through EIP-6963; WalletConnect covers mobile wallets and
 * is only downloaded when someone chooses it, which keeps the first page load small.
 */
export function WalletDialog() {
  const id = useIdentity()
  const { connectors, connectAsync, isPending, variables } = useConnect()
  const { isConnected } = useAccount()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isConnected) id.closeWalletDialog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  useEffect(() => {
    if (!id.walletDialogOpen) setError(null)
  }, [id.walletDialogOpen])

  const discovered = connectors.filter((c) => c.id !== 'injected')
  const list = discovered.length > 0 ? discovered : connectors

  const pick = async (connector: (typeof connectors)[number]) => {
    setError(null)
    try {
      await connectAsync({ connector })
    } catch (err) {
      const message = (err as Error).message ?? ''
      setError(/reject|denied|closed/i.test(message) ? 'The request was cancelled in your wallet.' : 'The wallet could not connect. Unlock it and try again.')
    }
  }

  return (
    <Dialog open={id.walletDialogOpen} onClose={id.closeWalletDialog} title="Connect a wallet" description="Choose the wallet you want to post, submit and get paid with.">
      {list.length === 0 ? (
        <p className="text-sm text-mute">
          No wallet was found in this browser. Install a browser wallet such as MetaMask or Rabby, or open this site inside your wallet app.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((connector) => {
            const loading = isPending && variables?.connector === connector
            return (
              <li key={connector.uid}>
                <button
                  type="button"
                  onClick={() => void pick(connector)}
                  disabled={isPending}
                  className="flex w-full items-center gap-3 rounded border-2 border-ink bg-white px-4 py-3 text-left font-bold hover:bg-signal-soft disabled:opacity-60"
                >
                  {connector.icon ? (
                    <img src={connector.icon} alt="" width={28} height={28} className="rounded" />
                  ) : (
                    <span aria-hidden className="grid size-7 place-items-center rounded bg-signal text-xs">
                      {connector.name[0]}
                    </span>
                  )}
                  <span className="flex-1">{connector.type === 'walletConnect' ? 'WalletConnect, for mobile wallets' : connector.name}</span>
                  {loading && <Spinner size={18} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}

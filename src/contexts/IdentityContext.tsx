import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAccount, useDisconnect, useSignMessage } from 'wagmi'
import { useAuth } from '@/contexts/AuthContext'
import { useMe, useWalletLink } from '@/lib/api/queries'
import { errorMessage } from '@/lib/api/client'

/**
 * A FixBounty identity is two things bound together: a Google account and a wallet whose
 * ownership was proven with a signature. The platform only lets you act when both are
 * present and linked, so every action can be traced to one person and one wallet.
 */
export type IdentityStatus =
  | 'loading'
  | 'none' //            nothing connected
  | 'needs_google' //     wallet connected, Google missing
  | 'needs_wallet' //     Google signed in, wallet missing
  | 'needs_link' //       both connected, not linked yet
  | 'wallet_mismatch' //  connected wallet differs from the linked one
  | 'ready'

interface IdentityValue {
  status: IdentityStatus
  address: `0x${string}` | undefined
  linkedWallet: string | null
  isAdmin: boolean
  busy: boolean
  error: string | null
  connectWallet: () => void
  walletDialogOpen: boolean
  closeWalletDialog: () => void
  signInWithGoogle: () => Promise<void>
  linkWallet: () => Promise<void>
  unlinkWallet: () => Promise<void>
  disconnectWallet: () => void
  clearError: () => void
}

const IdentityContext = createContext<IdentityValue | null>(null)

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, signIn } = useAuth()
  const { address, isConnected, status: walletStatus } = useAccount()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const [walletDialogOpen, setWalletDialogOpen] = useState(false)
  const me = useMe()
  const walletLink = useWalletLink()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linkedWallet = me.data?.wallet ?? null
  const walletConnected = isConnected && Boolean(address)

  const status: IdentityStatus = (() => {
    if (authLoading || walletStatus === 'reconnecting' || walletStatus === 'connecting') return 'loading'
    if (user && me.isPending) return 'loading'
    if (!user && !walletConnected) return 'none'
    if (!user) return 'needs_google'
    if (!walletConnected) return 'needs_wallet'
    if (!linkedWallet) return 'needs_link'
    if (linkedWallet.toLowerCase() !== address.toLowerCase()) return 'wallet_mismatch'
    return 'ready'
  })()

  const linkWallet = useCallback(async () => {
    if (!address) return
    setBusy(true)
    setError(null)
    try {
      const { message } = await walletLink.challenge(address)
      const signature = await signMessageAsync({ message })
      await walletLink.link(address, signature)
    } catch (err) {
      const text = errorMessage(err)
      setError(/reject|denied/i.test(text) ? 'You declined the signature request. Nothing was changed.' : text)
    } finally {
      setBusy(false)
    }
  }, [address, signMessageAsync, walletLink])

  const unlinkWallet = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await walletLink.unlink()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [walletLink])

  const value = useMemo<IdentityValue>(
    () => ({
      status,
      address,
      linkedWallet,
      isAdmin: me.data?.isAdmin ?? false,
      busy,
      error,
      connectWallet: () => setWalletDialogOpen(true),
      walletDialogOpen,
      closeWalletDialog: () => setWalletDialogOpen(false),
      signInWithGoogle: signIn,
      linkWallet,
      unlinkWallet,
      disconnectWallet: () => disconnect(),
      clearError: () => setError(null),
    }),
    [status, address, linkedWallet, me.data?.isAdmin, busy, error, walletDialogOpen, signIn, linkWallet, unlinkWallet, disconnect],
  )

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function useIdentity(): IdentityValue {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be used inside <IdentityProvider>')
  return ctx
}

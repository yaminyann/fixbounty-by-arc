import { Callout, PageHeader } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { AddressChip, Avatar } from '@/components/ui/Address'
import { useAuth } from '@/contexts/AuthContext'
import { useIdentity } from '@/contexts/IdentityContext'

export default function Account() {
  const { user, signOut } = useAuth()
  const id = useIdentity()

  return (
    <div className="max-w-2xl">
      <PageHeader title="Account">Your Google account and the wallet tied to it.</PageHeader>

      <section className="space-y-4 border-t-2 border-ink py-6">
        <h2 className="font-display text-xl font-bold">Google account</h2>
        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.displayName ?? user.email} src={user.photoURL} size={44} />
              <div>
                <p className="font-bold">{user.displayName ?? 'Signed in'}</p>
                <p className="text-sm text-mute">{user.email}</p>
              </div>
            </div>
            <Button variant="danger" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-mute">Sign in to post bounties, submit work and see your dashboard.</p>
            <Button variant="primary" onClick={() => void id.signInWithGoogle()}>
              Sign in with Google
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t-2 border-ink py-6">
        <h2 className="font-display text-xl font-bold">Wallet</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-mute">Connected</dt>
            <dd>{id.address ? <AddressChip address={id.address} /> : 'No wallet connected'}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-mute">Linked to your account</dt>
            <dd>{id.linkedWallet ? <AddressChip address={id.linkedWallet} /> : 'Nothing linked yet'}</dd>
          </div>
        </dl>

        {id.status === 'ready' && <Callout tone="ok">Your wallet and Google account are linked. You can post, submit and claim.</Callout>}
        {id.status === 'wallet_mismatch' && (
          <Callout tone="warn" title="The connected wallet is not the linked one">
            Switch to the linked wallet in your wallet app, or link the connected wallet to replace it.
          </Callout>
        )}
        {id.error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {id.error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!id.address && (
            <Button variant="primary" onClick={id.connectWallet}>
              Connect wallet
            </Button>
          )}
          {id.address && user && (id.status === 'needs_link' || id.status === 'wallet_mismatch') && (
            <Button variant="primary" loading={id.busy} onClick={() => void id.linkWallet()}>
              {id.status === 'wallet_mismatch' ? 'Link connected wallet instead' : 'Sign and link wallet'}
            </Button>
          )}
          {id.address && <Button onClick={id.disconnectWallet}>Disconnect wallet</Button>}
          {id.linkedWallet && (
            <Button variant="danger" loading={id.busy} onClick={() => void id.unlinkWallet()}>
              Unlink wallet
            </Button>
          )}
        </div>
        <p className="text-xs text-mute">A wallet can belong to one account. Linking asks for a free signature and never sends a transaction.</p>
      </section>
    </div>
  )
}

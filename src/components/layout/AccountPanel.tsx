import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useIdentity } from '@/contexts/IdentityContext'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Address'
import { shortAddress } from '@/lib/money'
import { cn } from '@/lib/cn'

function Row({ done, title, detail, action }: { done: boolean; title: string; detail: string; action?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink', done ? 'bg-signal' : 'bg-white')}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="num truncate text-xs text-mute">{detail}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </li>
  )
}

/** The account checklist: Google, wallet, and the signature that binds them. Used in the header menu and the mobile drawer. */
export function AccountPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut, error } = useAuth()
  const id = useIdentity()
  const linkedMatches = id.status === 'ready'

  return (
    <div className="space-y-1">
      {user && (
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <Avatar name={user.displayName ?? user.email} src={user.photoURL} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{user.displayName ?? user.email}</p>
            {user.displayName && <p className="truncate text-xs text-mute">{user.email}</p>}
          </div>
        </div>
      )}

      <ul className="divide-y divide-line">
        <Row
          done={Boolean(user)}
          title="Google account"
          detail={user ? (user.email ?? 'Signed in') : 'Not signed in'}
          action={
            !user && (
              <Button size="sm" variant="primary" onClick={() => void id.signInWithGoogle()}>
                Sign in with Google
              </Button>
            )
          }
        />
        <Row
          done={Boolean(id.address)}
          title="Wallet"
          detail={id.address ? shortAddress(id.address) : 'Not connected'}
          action={
            id.address ? (
              <Button size="sm" variant="ghost" onClick={id.disconnectWallet}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" variant={user ? 'primary' : 'secondary'} onClick={id.connectWallet}>
                Connect wallet
              </Button>
            )
          }
        />
        <Row
          done={linkedMatches}
          title="Wallet linked to account"
          detail={
            id.linkedWallet
              ? linkedMatches
                ? 'Verified by signature'
                : `Linked: ${shortAddress(id.linkedWallet)}`
              : 'Needs both of the above'
          }
          action={
            (id.status === 'needs_link' || id.status === 'wallet_mismatch') && (
              <Button size="sm" variant="primary" loading={id.busy} onClick={() => void id.linkWallet()}>
                {id.status === 'wallet_mismatch' ? 'Link this wallet instead' : 'Link wallet'}
              </Button>
            )
          }
        />
      </ul>

      {(id.error || error) && (
        <p role="alert" className="pt-2 text-xs font-medium text-danger">
          {id.error ?? error}
        </p>
      )}

      {user && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-3">
          <Link to="/account" onClick={onNavigate} className="text-sm font-bold underline underline-offset-2">
            Account
          </Link>
          {id.isAdmin && (
            <Link to="/admin" onClick={onNavigate} className="text-sm font-bold underline underline-offset-2">
              Admin console
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              onNavigate?.()
              void signOut()
            }}
            className="ml-auto text-sm font-bold text-danger underline underline-offset-2"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

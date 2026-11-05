import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, ChevronDown, Menu, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useIdentity } from '@/contexts/IdentityContext'
import { AccountPanel } from '@/components/layout/AccountPanel'
import { SidebarNav } from '@/components/layout/Sidebar'
import { Avatar } from '@/components/ui/Address'
import { Button, ButtonLink } from '@/components/ui/Button'
import { useUnreadCount } from '@/lib/api/ecosystem'
import { cn } from '@/lib/cn'
import { shortAddress } from '@/lib/money'
import { DISCOVER_NAV } from '@/lib/nav'

function Logo() {
  return (
    <Link to="/" aria-label="BountyFi home" className="flex shrink-0 items-center gap-2 font-display text-lg font-semibold tracking-tight">
      <img src="/brand/mark.png" alt="" width={32} height={32} className="size-8 rounded-md" />
      <span>
        Bounty<span className="rounded-sm bg-signal px-1">Fi</span>
      </span>
    </Link>
  )
}

/** Opens for the page it was opened on, so navigating closes it without an effect. */
function usePageScopedOpen() {
  const { pathname } = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (value: boolean | ((v: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(open) : value
    setOpenOn(next ? pathname : null)
  }
  return [open, setOpen] as const
}

function NotificationsLink() {
  const { user } = useAuth()
  const unread = useUnreadCount(Boolean(user))
  const count = unread.data ?? 0
  if (!user) return null
  return (
    <Link
      to="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      className="relative grid size-9 place-items-center rounded-md text-mute hover:bg-ink/5 hover:text-ink"
    >
      <Bell size={18} aria-hidden />
      {count > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-signal-deep ring-2 ring-surface" />}
    </Link>
  )
}

function AccountMenu() {
  const { user } = useAuth()
  const id = useIdentity()
  const { pathname } = useLocation()
  const [open, setOpen] = usePageScopedOpen()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // setOpen only closes the menu for the current path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (id.status === 'none') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => void id.signInWithGoogle()}>
          Sign in
        </Button>
        <Button size="sm" variant="primary" onClick={id.connectWallet}>
          Connect wallet
        </Button>
      </div>
    )
  }

  // Admin tools only need the Google account, so the wallet reminder stays out of the console.
  const incomplete = id.status !== 'ready' && id.status !== 'loading' && !pathname.startsWith('/admin')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface pl-1.5 pr-2 text-sm font-medium hover:border-ink/30"
      >
        <Avatar name={user?.displayName ?? user?.email ?? id.address} src={user?.photoURL} size={24} />
        <span className="hidden max-w-[9rem] truncate sm:inline">
          {id.address ? <span className="num text-xs">{shortAddress(id.address)}</span> : (user?.displayName ?? 'Account')}
        </span>
        {incomplete && <span className="rounded bg-signal px-1.5 py-0.5 text-xs">Finish setup</span>}
        <ChevronDown size={14} aria-hidden className={cn('text-mute transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="dialog" aria-label="Account" className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-line bg-surface p-4 shadow-pop animate-fade-in">
          <AccountPanel onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

const TOP_LINK = 'rounded-md px-3 py-1.5 text-sm font-medium text-mute transition-colors hover:bg-ink/5 hover:text-ink'

export function Header() {
  const { user } = useAuth()
  const [drawer, setDrawer] = usePageScopedOpen()

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
            {DISCOVER_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn(TOP_LINK, isActive && 'bg-ink/5 text-ink')}>
                {item.label.replace('Explore bounties', 'Explore')}
              </NavLink>
            ))}
            {user && (
              <NavLink to="/dashboard" className={({ isActive }) => cn(TOP_LINK, isActive && 'bg-ink/5 text-ink')}>
                Workspace
              </NavLink>
            )}
            <NavLink to="/help" className={({ isActive }) => cn(TOP_LINK, isActive && 'bg-ink/5 text-ink')}>
              How it works
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <NotificationsLink />
          <ButtonLink to="/create" size="sm" variant="accent" icon={<Plus size={15} aria-hidden />} className="hidden sm:inline-flex">
            Post a bounty
          </ButtonLink>
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md text-ink hover:bg-ink/5 md:hidden"
            aria-label={drawer ? 'Close menu' : 'Open menu'}
            aria-expanded={drawer}
            aria-controls="mobile-menu"
            onClick={() => setDrawer((v) => !v)}
          >
            {drawer ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {drawer && (
        <div id="mobile-menu" className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-line bg-surface px-4 pb-6 pt-3 md:hidden">
          <div className="mb-4 flex flex-wrap items-center gap-2 sm:hidden">
            <ButtonLink to="/create" size="sm" variant="accent" icon={<Plus size={15} aria-hidden />}>
              Post a bounty
            </ButtonLink>
            <AccountMenu />
          </div>
          <SidebarNav signedIn={Boolean(user)} onNavigate={() => setDrawer(false)} />
        </div>
      )}
    </header>
  )
}

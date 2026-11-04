import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Menu, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useIdentity } from '@/contexts/IdentityContext'
import { AccountPanel } from '@/components/layout/AccountPanel'
import { Avatar } from '@/components/ui/Address'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { shortAddress } from '@/lib/money'

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/create', label: 'Post a bounty' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/activity', label: 'Activity' },
  { to: '/help', label: 'How it works' },
]

function Logo() {
  return (
    <Link to="/" aria-label="BountyFi home" className="flex shrink-0 items-center gap-2.5 font-display text-xl font-bold tracking-tight">
      <img src="/brand/mark.png" alt="" width={36} height={36} className="size-9 rounded border-2 border-ink" />
      <span>
        Bounty<span className="rounded-sm bg-signal px-1">Fi</span>
      </span>
    </Link>
  )
}

function AccountMenu() {
  const { user } = useAuth()
  const id = useIdentity()
  // The menu is open for the page it was opened on, so navigating closes it without an effect.
  const { pathname } = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (value: boolean | ((v: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(open) : value
    setOpenOn(next ? pathname : null)
  }
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpenOn(null)
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (id.status === 'none') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void id.signInWithGoogle()}>
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
        className="flex h-10 items-center gap-2 rounded border-2 border-ink bg-white px-2.5 text-sm font-bold hover:bg-signal-soft"
      >
        <Avatar name={user?.displayName ?? user?.email ?? id.address} src={user?.photoURL} size={22} />
        <span className="hidden max-w-[9rem] truncate sm:inline">{id.address ? <span className="num">{shortAddress(id.address)}</span> : (user?.displayName ?? 'Account')}</span>
        {incomplete && (
          <span className="rounded bg-signal px-1.5 py-0.5 text-xs">Finish setup</span>
        )}
        <ChevronDown size={14} aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="dialog" aria-label="Account" className="absolute right-0 top-full z-50 mt-2 w-80 rounded-md border-2 border-ink bg-white p-4 shadow-hard animate-fade-in">
          <AccountPanel onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

export function Header() {
  const { pathname } = useLocation()
  const [drawerOn, setDrawerOn] = useState<string | null>(null)
  const drawer = drawerOn === pathname
  const setDrawer = (value: boolean | ((v: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(drawer) : value
    setDrawerOn(next ? pathname : null)
  }

  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded px-3 py-2 text-sm font-bold decoration-2 underline-offset-[10px] hover:bg-signal-soft',
                  isActive && 'underline decoration-ink',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
          <button
            type="button"
            className="grid size-10 place-items-center rounded border-2 border-ink lg:hidden"
            aria-label={drawer ? 'Close menu' : 'Open menu'}
            aria-expanded={drawer}
            aria-controls="mobile-menu"
            onClick={() => setDrawer((v) => !v)}
          >
            {drawer ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </div>

      {drawer && (
        <div id="mobile-menu" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-white px-4 pb-6 lg:hidden">
          <nav aria-label="Mobile" className="flex flex-col py-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('border-b border-line py-3 text-base font-bold', isActive && 'bg-signal-soft px-2')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      {/* Small screens get the account control inside the drawer, plus a quick entry here. */}
      <div className="border-t border-line px-4 py-2 sm:hidden">
        <AccountMenu />
      </div>
    </header>
  )
}

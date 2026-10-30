import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAuth } from '@/contexts/AuthContext'
import { ACTIVE_NETWORK } from '@/lib/networkConfig'
import { BOUNTY_BOARD_ADDRESS, ARC_EXPLORER_URL } from '@/lib/contract'
import {
  Menu,
  X,
  Bug,
  CheckSquare,
  Plus,
  LayoutDashboard,
  Search,
  ChevronRight,
  ChevronDown,
  User as UserIcon,
  LogOut,
  FolderPlus,
  Send,
  Activity,
  History,
  ExternalLink,
  Loader2,
  Shield,
  HelpCircle,
  FileCode,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const NAV_LINKS = [
  { to: '/explore', label: 'Explore Tasks', icon: Search },
  { to: '/create', label: 'Post a Task', icon: Plus },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle, signOut, error, isAdmin } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false)
    setProfileDropdownOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-[#FAFAF8] font-sans flex flex-col justify-between">
      <div>
        {/* Network banner */}
        <div
          className={`border-b-2 border-black py-1 px-4 text-center text-xs font-bold tracking-wide flex items-center justify-center gap-2 ${
            ACTIVE_NETWORK === 'mainnet' ? 'bg-orange-400 text-black' : 'bg-yellow-300 text-black'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
          {ACTIVE_NETWORK === 'mainnet' ? (
            <span>Arc Mainnet • Real USDC. Transactions are irreversible.</span>
          ) : (
            <span className="truncate">
              Arc Testnet • Test currency only (no monetary value)
            </span>
          )}
        </div>

        {/* Header */}
        <header className="border-b-2 border-black bg-white sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-2 sm:gap-4">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2 font-display font-black text-xl tracking-tight hover:opacity-90 transition-opacity shrink-0"
            >
              <div className="w-8 h-8 bg-yellow-300 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_black]">
                <CheckSquare size={18} strokeWidth={2.5} />
              </div>
              <span className="tracking-tight">TaskFi</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ to, label }) => {
                const isActive = location.pathname.startsWith(to)
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`px-3.5 py-1.5 text-sm font-bold border-2 transition-all ${
                      isActive
                        ? 'border-black bg-black text-white shadow-[2px_2px_0px_#EAB308]'
                        : 'border-transparent hover:border-black hover:bg-yellow-100 text-black'
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`px-3 py-1.5 text-xs font-bold border-2 transition-all flex items-center gap-1.5 ${
                    location.pathname.startsWith('/admin')
                      ? 'border-black bg-black text-yellow-300 shadow-[2px_2px_0px_#EAB308]'
                      : 'border-black bg-yellow-200 hover:bg-yellow-300 text-black'
                  }`}
                >
                  <Shield size={13} />
                  Admin
                </Link>
              )}
            </nav>

            {/* Right Side: Wallet & Google Auth */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* Web3 Wallet Connect */}
              <div className="shrink-0 scale-90 sm:scale-100 origin-right">
                <ConnectKitButton />
              </div>

              {/* Google Auth / Profile Control */}
              {loading ? (
                <div className="h-9 w-16 sm:w-24 border-2 border-black bg-gray-100 flex items-center justify-center animate-pulse">
                  <Loader2 size={16} className="animate-spin text-gray-500" />
                </div>
              ) : user ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setProfileDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 sm:gap-2 border-2 border-black px-2 sm:px-2.5 py-1.5 bg-white hover:bg-yellow-300 transition-all text-xs sm:text-sm font-bold shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
                    aria-label="User menu"
                  >
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="w-5 h-5 rounded-full border border-black object-cover"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-yellow-400 border border-black flex items-center justify-center text-[10px] font-bold">
                        {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="max-w-[70px] sm:max-w-[110px] truncate hidden md:inline">
                      {user.displayName ?? user.email?.split('@')[0]}
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {profileDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white border-2 border-black shadow-[4px_4px_0px_black] py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* Identity Card */}
                      <div className="px-4 py-2.5 border-b-2 border-gray-100 bg-gray-50">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {user.displayName || 'Google User'}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                      </div>

                      {/* Menu Links */}
                      <Link
                        to="/dashboard"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        <LayoutDashboard size={14} />
                        Dashboard
                      </Link>

                      <Link
                        to="/dashboard?tab=created"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        <FolderPlus size={14} />
                        My Bounties
                      </Link>

                      <Link
                        to="/dashboard?tab=submitted"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        <Send size={14} />
                        My Submissions
                      </Link>

                      <Link
                        to="/dashboard?tab=history"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        <History size={14} />
                        My History
                      </Link>

                      <Link
                        to="/profile"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        <UserIcon size={14} />
                        Profile & Wallet Link
                      </Link>

                      <Link
                        to="/activity"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        <Activity size={14} />
                        Activity Log
                      </Link>

                      <Link
                        to="/admin"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold hover:bg-yellow-300 transition-colors border-b-2 border-gray-100"
                      >
                        <Shield size={14} className="text-yellow-600" />
                        Admin Console
                      </Link>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false)
                          void signOut()
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-left"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 border-2 border-black bg-white hover:bg-yellow-300 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-bold shadow-[2px_2px_0px_black] transition-all active:translate-x-0.5 active:translate-y-0.5 shrink-0"
                  title="Sign in with Google"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="hidden xs:inline">Sign In</span>
                </button>
              )}

              {/* Mobile menu toggle */}
              <button
                className="md:hidden border-2 border-black p-2 bg-white hover:bg-yellow-300 active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[1px_1px_0px_black] shrink-0"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Toggle navigation menu"
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>

          {/* Mobile Backdrop & Drawer */}
          {menuOpen && (
            <>
              {/* Click-away backdrop */}
              <div
                className="fixed inset-0 top-[105px] bg-black/40 z-30 md:hidden"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />

              {/* Mobile Drawer */}
              <div className="md:hidden border-t-2 border-black bg-white divide-y-2 divide-gray-100 relative z-40 shadow-[0_8px_0px_rgba(0,0,0,1)] max-h-[calc(100vh-120px)] overflow-y-auto">
                <div className="p-3 bg-yellow-50 border-b-2 border-black flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-gray-600">
                    Navigation Menu
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-yellow-300 border border-black font-bold">
                    Arc 5042002
                  </span>
                </div>

                {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 text-sm font-bold min-h-[44px] ${
                      location.pathname.startsWith(to) ? 'bg-black text-white' : 'hover:bg-yellow-200 text-black'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                    <ChevronRight size={16} className="ml-auto opacity-70" />
                  </Link>
                ))}

                {user ? (
                  <>
                    <div className="p-3 bg-gray-50 border-t-2 border-black">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        Signed in as {user.displayName || user.email}
                      </p>
                    </div>

                    <Link
                      to="/dashboard?tab=created"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <FolderPlus size={16} />
                      <span>My Bounties</span>
                    </Link>
                    <Link
                      to="/dashboard?tab=submitted"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <Send size={16} />
                      <span>My Submissions</span>
                    </Link>
                    <Link
                      to="/dashboard?tab=history"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <History size={16} />
                      <span>My History</span>
                    </Link>
                    <Link
                      to="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <UserIcon size={16} />
                      <span>Profile & Linked Wallet</span>
                    </Link>
                    <Link
                      to="/help"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <HelpCircle size={16} />
                      <span>Help & Security FAQ</span>
                    </Link>
                    <Link
                      to="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <Shield size={16} className="text-yellow-600" />
                      <span>Admin Console</span>
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        void signOut()
                      }}
                      className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50 w-full text-left min-h-[44px]"
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/help"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-200 min-h-[44px]"
                    >
                      <HelpCircle size={16} />
                      <span>Help & Security FAQ</span>
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        void signInWithGoogle()
                      }}
                      className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold hover:bg-yellow-300 w-full text-left min-h-[44px]"
                    >
                      <UserIcon size={18} />
                      <span>Sign In with Google</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-red-100 border-b-2 border-red-500 py-2 px-4 text-center text-xs text-red-800 font-medium">
            {error}
          </div>
        )}

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </div>

      {/* Professional Platform Footer */}
      <footer className="border-t-2 border-black bg-white mt-20">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Main 4-Column Structured Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b-2 border-gray-100">
            {/* Column 1: Brand & Overview */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2 font-display font-black text-xl tracking-tight">
                <span className="p-1 bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_black]">
                  <CheckSquare size={18} />
                </span>
                <span>TaskFi</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                The decentralized task and bounty marketplace on Arc. Fund crypto deliverables, audits, bug fixes, and development tasks with non-custodial USDC escrow.
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold bg-yellow-100 border border-black shadow-[1px_1px_0px_black]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Arc Chain ID: 5042002
                </span>
              </div>
            </div>

            {/* Column 2: Platform Navigation */}
            <div className="space-y-2.5">
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-black">
                Platform
              </h3>
              <ul className="space-y-2 text-xs font-bold text-gray-600">
                <li>
                  <Link to="/explore" className="hover:text-black hover:underline transition-colors">
                    Explore Tasks
                  </Link>
                </li>
                <li>
                  <Link to="/create" className="hover:text-black hover:underline transition-colors">
                    Post a Task
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-black hover:underline transition-colors">
                    Contributor Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/activity" className="hover:text-black hover:underline transition-colors">
                    Activity Stream
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Resources & Verification */}
            <div className="space-y-2.5">
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-black">
                Resources
              </h3>
              <ul className="space-y-2 text-xs font-bold text-gray-600">
                <li>
                  <Link to="/help" className="hover:text-black hover:underline transition-colors">
                    Documentation & Guides
                  </Link>
                </li>
                <li>
                  <Link to="/help#security" className="hover:text-black hover:underline transition-colors">
                    Security & Invariants
                  </Link>
                </li>
                <li>
                  <a
                    href={`${ARC_EXPLORER_URL}/address/${BOUNTY_BOARD_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-black hover:underline transition-colors inline-flex items-center gap-1"
                  >
                    <span>Arc Testnet Explorer</span>
                    <ExternalLink size={11} />
                  </a>
                </li>
                <li>
                  <Link to="/admin" className="hover:text-black hover:underline transition-colors">
                    Admin Portal
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Protocol Specs */}
            <div className="space-y-2.5">
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-black">
                Protocol Specs
              </h3>
              <ul className="space-y-1.5 text-xs text-gray-600 font-mono">
                <li className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-500 font-sans">Settlement</span>
                  <span className="font-bold text-black">Native USDC</span>
                </li>
                <li className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-500 font-sans">Protocol Fee</span>
                  <span className="font-bold text-green-700">0% (V1 Escrow)</span>
                </li>
                <li className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-500 font-sans">Escrow Model</span>
                  <span className="font-bold text-black">Non-Custodial</span>
                </li>
                <li className="flex items-center justify-between pt-1">
                  <span className="text-gray-500 font-sans">Contract</span>
                  <span className="font-bold text-gray-800" title={BOUNTY_BOARD_ADDRESS}>
                    {BOUNTY_BOARD_ADDRESS.slice(0, 6)}…{BOUNTY_BOARD_ADDRESS.slice(-4)}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar: Copyright & Network Status */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-gray-500 font-mono">
            <div>
              © {new Date().getFullYear()} TaskFi. Non-custodial task & bounty marketplace.
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
              <span>Arc Testnet (5042002) — All USDC is test currency.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

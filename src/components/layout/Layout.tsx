import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAuth } from '@/contexts/AuthContext'
import {
  Menu,
  X,
  Bug,
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
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const NAV_LINKS = [
  { to: '/explore', label: 'Explore', icon: Search },
  { to: '/create', label: 'Post Bounty', icon: Plus },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle, signOut, error } = useAuth()
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

  return (
    <div className="min-h-dvh bg-[#FAFAF8] font-sans flex flex-col justify-between">
      <div>
        {/* Testnet banner */}
        <div className="bg-yellow-300 border-b-2 border-black py-1 px-4 text-center text-xs font-bold tracking-wide flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
          <span>ARC TESTNET — Chain ID 5042002 • USDC Native Gas & Rewards (Testnet funds have no real monetary value)</span>
        </div>

        {/* Header */}
        <header className="border-b-2 border-black bg-white sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2 font-display font-bold text-xl tracking-tight hover:opacity-85 transition-opacity shrink-0"
            >
              <div className="w-8 h-8 bg-yellow-300 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_black]">
                <Bug size={18} strokeWidth={2.5} />
              </div>
              <span>FixBounty</span>
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
                        : 'border-transparent hover:border-black hover:bg-yellow-100'
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}
            </nav>

            {/* Right Side: Wallet & Google Auth */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Web3 Wallet Connect */}
              <div className="scale-90 sm:scale-100 origin-right">
                <ConnectKitButton />
              </div>

              {/* Google Auth / Profile Control */}
              {loading ? (
                <div className="h-9 w-24 border-2 border-black bg-gray-100 flex items-center justify-center animate-pulse">
                  <Loader2 size={16} className="animate-spin text-gray-500" />
                </div>
              ) : user ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setProfileDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-2 border-2 border-black px-2.5 py-1.5 bg-white hover:bg-yellow-300 transition-all text-xs sm:text-sm font-bold shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
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
                    <span className="max-w-[90px] sm:max-w-[120px] truncate hidden xs:inline">
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
                  className="inline-flex items-center gap-1.5 border-2 border-black bg-white hover:bg-yellow-300 px-3 py-1.5 text-xs sm:text-sm font-bold shadow-[2px_2px_0px_black] transition-all active:translate-x-0.5 active:translate-y-0.5"
                  title="Sign in with Google"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                  <span>Sign In</span>
                </button>
              )}

              {/* Mobile menu toggle */}
              <button
                className="md:hidden border-2 border-black p-1.5 bg-white hover:bg-yellow-300"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="md:hidden border-t-2 border-black bg-white divide-y-2 divide-gray-100">
              {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-bold ${
                    location.pathname.startsWith(to) ? 'bg-black text-white' : 'hover:bg-yellow-300'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                  <ChevronRight size={14} className="ml-auto" />
                </Link>
              ))}

              {user ? (
                <>
                  <Link
                    to="/dashboard?tab=created"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-300"
                  >
                    <FolderPlus size={16} />
                    My Bounties
                  </Link>
                  <Link
                    to="/dashboard?tab=submitted"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-300"
                  >
                    <Send size={16} />
                    My Submissions
                  </Link>
                  <Link
                    to="/dashboard?tab=history"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-300"
                  >
                    <History size={16} />
                    My History
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-300"
                  >
                    <UserIcon size={16} />
                    Profile & Wallet
                  </Link>
                  <Link
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-300"
                  >
                    <Shield size={16} className="text-yellow-600" />
                    Admin Console
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      void signOut()
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <LogOut size={16} />
                    Sign Out ({user.displayName ?? user.email})
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    void signInWithGoogle()
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-yellow-300 w-full text-left"
                >
                  <UserIcon size={16} />
                  Sign in with Google
                </button>
              )}
            </div>
          )}
        </header>

        {/* Global Error Banner if Auth has configuration issue */}
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

      {/* Footer */}
      <footer className="border-t-2 border-black bg-white mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <div className="flex items-center gap-2 font-bold">
              <Bug size={16} />
              FixBounty
            </div>
            <span className="text-gray-300 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
              <span>Built by</span>
              <a
                href="https://www.linkedin.com/in/yaminyann/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-black hover:text-yellow-600 underline decoration-2 underline-offset-2 inline-flex items-center gap-1 transition-colors"
                title="Yamin's LinkedIn Profile"
              >
                Yamin
                <ExternalLink size={11} className="inline opacity-70" />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-gray-600 text-xs sm:text-sm">
            <Link to="/help" className="hover:text-black font-medium transition-colors">Help & FAQ</Link>
            <a href="https://explorer.testnet.arc.io" target="_blank" rel="noopener noreferrer" className="hover:text-black font-medium transition-colors">Arc Explorer</a>
            <Link to="/help#security" className="hover:text-black font-medium transition-colors">Security Architecture</Link>
            <Link to="/admin" className="hover:text-black font-medium transition-colors">Admin</Link>
          </div>
          <p className="text-gray-500 text-xs text-center sm:text-right">Arc Testnet — All USDC is test currency</p>
        </div>
      </footer>
    </div>
  )
}

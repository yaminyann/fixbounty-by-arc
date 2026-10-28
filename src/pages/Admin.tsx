/* oxlint-disable react/set-state-in-effect */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  RefreshCw,
  Search,
  ExternalLink,
  DollarSign,
  Briefcase,
  FileCode,
  Users,
  Eye,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pagination } from '@/components/ui/Pagination'
import {
  apiGetAdminStats,
  apiGetAdminBounties,
  apiGetAdminSubmissions,
  apiGetActivity,
  type ApiAdminStats,
  type ApiAdminBounty,
  type ApiAdminSubmission,
  type ApiActivity,
} from '@/lib/api'
import { BOUNTY_BOARD_ADDRESS, ARC_EXPLORER_URL } from '@/lib/contract'

// Configured admin credentials from environment or defaults
const ADMIN_PASSWORD_ENV =
  (import.meta as { env?: { VITE_ADMIN_PASSWORD?: string } }).env?.VITE_ADMIN_PASSWORD || 'fixbounty_admin_2026_arc'

const ADMIN_EMAILS_ENV = (
  (import.meta as { env?: { VITE_ADMIN_EMAILS?: string } }).env?.VITE_ADMIN_EMAILS || 'yaminv75@gmail.com,admin@fixbounty.io'
)
  .toLowerCase()
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

export function Admin() {
  const { user } = useAuth()

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('fixbounty_admin_authenticated') === 'true'
  })
  const [passkeyInput, setPasskeyInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMethod, setAuthMethod] = useState<'passkey' | 'google' | null>(() => {
    return (sessionStorage.getItem('fixbounty_admin_auth_method') as 'passkey' | 'google') || null
  })

  // Auto-authenticate if logged-in Google email is whitelisted
  useEffect(() => {
    if (user?.email && ADMIN_EMAILS_ENV.includes(user.email.toLowerCase())) {
      setIsAuthenticated(true)
      setAuthMethod('google')
      sessionStorage.setItem('fixbounty_admin_authenticated', 'true')
      sessionStorage.setItem('fixbounty_admin_auth_method', 'google')
    }
  }, [user])

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'bounties' | 'submissions' | 'activity'>('overview')

  // Stats state
  const [stats, setStats] = useState<ApiAdminStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Bounties state
  const [bounties, setBounties] = useState<ApiAdminBounty[]>([])
  const [bountiesTotal, setBountiesTotal] = useState(0)
  const [bountiesLoading, setBountiesLoading] = useState(false)
  const [bountySearch, setBountySearch] = useState('')
  const [bountyStatusFilter, setBountyStatusFilter] = useState('all')
  const [bountyPage, setBountyPage] = useState(1)
  const [bountyPageSize, setBountyPageSize] = useState(10)

  // Submissions state
  const [submissions, setSubmissions] = useState<ApiAdminSubmission[]>([])
  const [submissionsTotal, setSubmissionsTotal] = useState(0)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('all')
  const [submissionPage, setSubmissionPage] = useState(1)
  const [submissionPageSize, setSubmissionPageSize] = useState(10)

  // Activity feed state
  const [activities, setActivities] = useState<ApiActivity[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [activityPageSize, setActivityPageSize] = useState(15)

  // Selected submission notes modal
  const [viewingNotes, setViewingNotes] = useState<ApiAdminSubmission | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Handle Passkey verification
  const handleVerifyPasskey = (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)

    if (passkeyInput.trim() === ADMIN_PASSWORD_ENV.trim()) {
      setIsAuthenticated(true)
      setAuthMethod('passkey')
      sessionStorage.setItem('fixbounty_admin_authenticated', 'true')
      sessionStorage.setItem('fixbounty_admin_auth_method', 'passkey')
      sessionStorage.setItem('fixbounty_admin_key', passkeyInput.trim())
    } else {
      setAuthError('Invalid Admin Passkey. Please check your credentials in .env.')
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setAuthMethod(null)
    sessionStorage.removeItem('fixbounty_admin_authenticated')
    sessionStorage.removeItem('fixbounty_admin_auth_method')
    sessionStorage.removeItem('fixbounty_admin_key')
  }

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await apiGetAdminStats()
      setStats(data)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  // Fetch Bounties
  const fetchBounties = useCallback(async () => {
    setBountiesLoading(true)
    try {
      const data = await apiGetAdminBounties({
        limit: bountyPageSize,
        offset: (bountyPage - 1) * bountyPageSize,
        status: bountyStatusFilter,
        search: bountySearch.trim() || undefined,
      })
      setBounties(data.bounties)
      setBountiesTotal(data.total)
    } finally {
      setBountiesLoading(false)
    }
  }, [bountyPage, bountyPageSize, bountyStatusFilter, bountySearch])

  // Fetch Submissions
  const fetchSubmissions = useCallback(async () => {
    setSubmissionsLoading(true)
    try {
      const data = await apiGetAdminSubmissions({
        limit: submissionPageSize,
        offset: (submissionPage - 1) * submissionPageSize,
        status: submissionStatusFilter,
        search: submissionSearch.trim() || undefined,
      })
      setSubmissions(data.submissions)
      setSubmissionsTotal(data.total)
    } finally {
      setSubmissionsLoading(false)
    }
  }, [submissionPage, submissionPageSize, submissionStatusFilter, submissionSearch])

  // Fetch Activity
  const fetchActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const data = await apiGetActivity({
        limit: activityPageSize,
        offset: (activityPage - 1) * activityPageSize,
      })
      setActivities(data.activity)
      setActivityTotal(data.total)
    } finally {
      setActivityLoading(false)
    }
  }, [activityPage, activityPageSize])

  // Trigger data fetching on auth or tab change
  useEffect(() => {
    if (!isAuthenticated) return
    if (activeTab === 'overview') {
      void fetchStats()
      void fetchBounties()
      void fetchSubmissions()
    } else if (activeTab === 'bounties') {
      void fetchBounties()
    } else if (activeTab === 'submissions') {
      void fetchSubmissions()
    } else if (activeTab === 'activity') {
      void fetchActivity()
    }
  }, [isAuthenticated, activeTab, fetchStats, fetchBounties, fetchSubmissions, fetchActivity])

  // Refresh current view
  const handleRefresh = () => {
    if (activeTab === 'overview') {
      void fetchStats()
      void fetchBounties()
      void fetchSubmissions()
    } else if (activeTab === 'bounties') {
      void fetchBounties()
    } else if (activeTab === 'submissions') {
      void fetchSubmissions()
    } else if (activeTab === 'activity') {
      void fetchActivity()
    }
  }

  // Calculate formatted total rewards
  const formattedTotalVolume = useMemo(() => {
    if (!stats?.bounties.totalRewards) return '0.00'
    const val = Number(stats.bounties.totalRewards)
    return isNaN(val) ? '0.00' : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }, [stats])

  // ---------------------------------------------------------------------------
  // View: Admin Authentication Gate
  // ---------------------------------------------------------------------------
  if (!isAuthenticated) {
    const isGoogleWhitelisted = user?.email && ADMIN_EMAILS_ENV.includes(user.email.toLowerCase())

    return (
      <div className="max-w-md mx-auto my-12">
        <div className="border-2 border-black bg-white p-8 shadow-[8px_8px_0px_black]">
          <div className="w-12 h-12 bg-yellow-300 border-2 border-black flex items-center justify-center mb-4 shadow-[3px_3px_0px_black]">
            <Lock size={24} />
          </div>

          <h1 className="font-display font-bold text-2xl tracking-tight mb-2">Admin Console Access</h1>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            This administrative dashboard provides platform-wide visibility across all bounties, submissions, and audit activities.
          </p>

          {isGoogleWhitelisted ? (
            <div className="mb-6 p-4 bg-yellow-50 border-2 border-black space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-black">
                <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                <span>Google Profile Authorized:</span>
              </div>
              <p className="text-xs font-mono font-bold bg-white px-2 py-1 border border-black truncate">
                {user.email}
              </p>
              <button
                onClick={() => {
                  setIsAuthenticated(true)
                  setAuthMethod('google')
                  sessionStorage.setItem('fixbounty_admin_authenticated', 'true')
                  sessionStorage.setItem('fixbounty_admin_auth_method', 'google')
                }}
                className="w-full bg-yellow-300 border-2 border-black py-2.5 px-4 font-bold text-xs uppercase tracking-wider hover:bg-black hover:text-white transition-all shadow-[3px_3px_0px_black] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2"
              >
                <Unlock size={14} />
                Enter Admin Console
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifyPasskey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Admin Passkey / Secret
                </label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    placeholder="Enter passkey from .env…"
                    value={passkeyInput}
                    onChange={(e) => setPasskeyInput(e.target.value)}
                    className="w-full border-2 border-black pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 font-mono"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Credential is configured via <code className="bg-gray-100 px-1 border border-gray-300">VITE_ADMIN_PASSWORD</code> in <code className="bg-gray-100 px-1 border border-gray-300">.env</code>.
                </p>
              </div>

              {authError && (
                <div className="p-3 bg-red-50 border-2 border-red-500 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-yellow-300 border-2 border-black py-2.5 font-bold text-xs uppercase tracking-wider hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_black] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2"
              >
                <Unlock size={14} />
                Authenticate Session
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t-2 border-black/10 flex items-center justify-between text-xs text-gray-500">
            <Link to="/" className="font-bold underline hover:text-black">
              Return to Homepage
            </Link>
            <span className="font-mono">Arc Testnet 5042002</span>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Authenticated Admin Dashboard
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Admin Top Command Header */}
      <div className="border-2 border-black bg-white p-5 shadow-[6px_6px_0px_black]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black text-yellow-300 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#EAB308]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-2xl tracking-tight">Admin Console</h1>
                <span className="bg-yellow-300 border border-black px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  Superuser
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Authenticated via <span className="font-bold text-black">{authMethod === 'google' ? user?.email : 'Environment Passkey'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              className="border-2 border-black px-3 py-1.5 bg-white hover:bg-yellow-300 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
              title="Refresh Data"
            >
              <RefreshCw size={13} className={statsLoading || bountiesLoading || submissionsLoading ? 'animate-spin' : ''} />
              <span>Sync</span>
            </button>

            <a
              href={`${ARC_EXPLORER_URL}/address/${BOUNTY_BOARD_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-black px-3 py-1.5 bg-white hover:bg-yellow-300 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
            >
              <ExternalLink size={13} />
              <span>Arc Explorer</span>
            </a>

            <button
              onClick={handleLogout}
              className="border-2 border-black px-3 py-1.5 bg-red-50 hover:bg-red-500 hover:text-white text-red-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
            >
              <LogOut size={13} />
              <span>Exit Admin</span>
            </button>
          </div>
        </div>

        {/* System telemetry bar */}
        <div className="mt-4 pt-3 border-t-2 border-black/10 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-bold">PostgreSQL:</span>
              <span className="text-gray-600">Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="font-bold">Contract:</span>
              <span className="font-mono text-gray-700">
                {BOUNTY_BOARD_ADDRESS.slice(0, 6)}…{BOUNTY_BOARD_ADDRESS.slice(-4)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="font-bold">Chain:</span>
              <span className="text-gray-600">Arc Testnet (5042002)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b-2 border-black bg-white">
        {[
          { key: 'overview', label: 'Platform Overview', icon: Briefcase },
          { key: 'bounties', label: `All Bounties (${bountiesTotal || '…'})`, icon: DollarSign },
          { key: 'submissions', label: `All Submissions (${submissionsTotal || '…'})`, icon: FileCode },
          { key: 'activity', label: `Live Audit Feed (${activityTotal || '…'})`, icon: ShieldAlert },
        ].map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-bold border-r-2 border-black transition-colors ${
                isActive ? 'bg-yellow-300 text-black shadow-[inset_0_-3px_0_black]' : 'bg-white hover:bg-yellow-100 text-gray-700'
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Volume Escrowed</span>
                <DollarSign size={18} className="text-black" />
              </div>
              <div className="font-display font-black text-3xl tabular-nums tracking-tight">
                ${formattedTotalVolume} <span className="text-xs font-bold text-gray-500">USDC</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">Across all created onchain bounties</div>
            </div>

            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Bounties</span>
                <Briefcase size={18} className="text-black" />
              </div>
              <div className="font-display font-black text-3xl tabular-nums tracking-tight">
                {stats?.bounties.total ?? '…'}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
                <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 border border-black/20">
                  {stats?.bounties.funded ?? 0} Funded
                </span>
                <span className="bg-green-100 text-green-800 px-1.5 py-0.5 border border-black/20">
                  {stats?.bounties.claimed ?? 0} Claimed
                </span>
                <span className="bg-gray-100 text-gray-800 px-1.5 py-0.5 border border-black/20">
                  {stats?.bounties.open ?? 0} Open
                </span>
              </div>
            </div>

            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Submissions</span>
                <FileCode size={18} className="text-black" />
              </div>
              <div className="font-display font-black text-3xl tabular-nums tracking-tight">
                {stats?.submissions.total ?? '…'}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
                <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 border border-black/20">
                  {stats?.submissions.pending ?? 0} Pending
                </span>
                <span className="bg-green-100 text-green-800 px-1.5 py-0.5 border border-black/20">
                  {stats?.submissions.approved ?? 0} Approved
                </span>
              </div>
            </div>

            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Platform Participants</span>
                <Users size={18} className="text-black" />
              </div>
              <div className="font-display font-black text-3xl tabular-nums tracking-tight">
                {stats?.users.total ?? '…'}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                <span className="font-bold text-black">{stats?.users.uniqueCreators ?? 0}</span> creators •{' '}
                <span className="font-bold text-black">{stats?.users.uniqueSubmitters ?? 0}</span> submitters
              </div>
            </div>
          </div>

          {/* Quick Preview Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Bounties Widget */}
            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base">Recent Platform Bounties</h3>
                <button
                  onClick={() => setActiveTab('bounties')}
                  className="text-xs font-bold text-black hover:bg-yellow-300 px-2 py-1 border border-black transition-colors"
                >
                  View All &rarr;
                </button>
              </div>

              {bounties.length === 0 ? (
                <p className="text-gray-500 text-xs py-6 text-center">No bounties posted yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {bounties.slice(0, 5).map((b) => (
                    <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/bounty/${b.onchainId || b.id}`}
                          className="font-bold text-xs hover:underline truncate block"
                        >
                          {b.title}
                        </Link>
                        <p className="text-[11px] text-gray-500 font-mono">
                          by {b.creatorWallet ? `${b.creatorWallet.slice(0, 6)}…${b.creatorWallet.slice(-4)}` : 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-xs">{b.rewardAmount} USDC</span>
                        <div className="scale-90 origin-right">
                          <StatusBadge status={b.onchainStatus} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Submissions Widget */}
            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base">Recent Code Submissions</h3>
                <button
                  onClick={() => setActiveTab('submissions')}
                  className="text-xs font-bold text-black hover:bg-yellow-300 px-2 py-1 border border-black transition-colors"
                >
                  View All &rarr;
                </button>
              </div>

              {submissions.length === 0 ? (
                <p className="text-gray-500 text-xs py-6 text-center">No submissions received yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {submissions.slice(0, 5).map((s) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-xs truncate">Target: {s.bountyTitle}</p>
                        <p className="text-[11px] text-gray-500 font-mono">
                          Submitter: {s.submitterWallet.slice(0, 6)}…{s.submitterWallet.slice(-4)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border border-black ${
                            s.status === 'approved'
                              ? 'bg-green-300'
                              : s.status === 'rejected'
                              ? 'bg-red-300'
                              : 'bg-yellow-300'
                          }`}
                        >
                          {s.status}
                        </span>
                        <a
                          href={s.pullRequestUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border border-black p-1 hover:bg-yellow-300"
                          title="View PR"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: ALL BOUNTIES MONITOR */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'bounties' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by bounty title, creator address, or tags…"
                value={bountySearch}
                onChange={(e) => {
                  setBountySearch(e.target.value)
                  setBountyPage(1)
                }}
                className="w-full border-2 border-black pl-9 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-gray-500" />
              <select
                value={bountyStatusFilter}
                onChange={(e) => {
                  setBountyStatusFilter(e.target.value)
                  setBountyPage(1)
                }}
                className="border-2 border-black bg-white px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-yellow-400"
              >
                <option value="all">All Statuses</option>
                <option value="0">0 - Open</option>
                <option value="1">1 - Funded</option>
                <option value="2">2 - Approved</option>
                <option value="3">3 - Claimed</option>
                <option value="4">4 - Refunded</option>
                <option value="5">5 - Cancelled</option>
              </select>
            </div>
          </div>

          {/* Bounties Table */}
          <div className="border-2 border-black bg-white shadow-[4px_4px_0px_black] overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-yellow-300 border-b-2 border-black font-black uppercase tracking-wider text-[11px]">
                  <th className="p-3 border-r border-black/30">ID / Title</th>
                  <th className="p-3 border-r border-black/30">Creator</th>
                  <th className="p-3 border-r border-black/30">Reward</th>
                  <th className="p-3 border-r border-black/30">Deadline</th>
                  <th className="p-3 border-r border-black/30">Submissions</th>
                  <th className="p-3 border-r border-black/30">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {bountiesLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      Loading bounties from database…
                    </td>
                  </tr>
                ) : bounties.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      No bounties match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  bounties.map((b) => (
                    <tr key={b.id} className="hover:bg-yellow-50/50 transition-colors">
                      {/* Title & Onchain ID */}
                      <td className="p-3 font-bold border-r border-black/10 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono bg-black text-white px-1 py-0.2 text-[10px] font-bold">
                            #{b.onchainId ?? '?'}
                          </span>
                          <Link to={`/bounty/${b.onchainId || b.id}`} className="hover:underline truncate block">
                            {b.title}
                          </Link>
                        </div>
                        {b.tags && b.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {b.tags.slice(0, 2).map((t) => (
                              <span key={t} className="text-[10px] bg-gray-100 px-1 border border-black/10">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Creator */}
                      <td className="p-3 font-mono border-r border-black/10">
                        {b.creatorWallet ? (
                          <div className="flex items-center gap-1.5">
                            <span>
                              {b.creatorWallet.slice(0, 6)}…{b.creatorWallet.slice(-4)}
                            </span>
                            <button
                              onClick={() => copyToClipboard(b.creatorWallet, `creator-${b.id}`)}
                              className="text-gray-400 hover:text-black"
                              title="Copy wallet address"
                            >
                              {copiedId === `creator-${b.id}` ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">Anonymous</span>
                        )}
                        {b.creatorEmail && <span className="text-[10px] text-gray-500 block truncate">{b.creatorEmail}</span>}
                      </td>

                      {/* Reward */}
                      <td className="p-3 font-bold border-r border-black/10 tabular-nums">
                        {b.rewardAmount} <span className="text-[10px] text-gray-500 font-normal">USDC</span>
                      </td>

                      {/* Deadline */}
                      <td className="p-3 border-r border-black/10 text-gray-600">
                        {b.deadline ? new Date(b.deadline).toLocaleDateString() : '—'}
                      </td>

                      {/* Submissions count */}
                      <td className="p-3 border-r border-black/10 text-center font-bold tabular-nums">
                        {b.submissionsCount ?? 0}
                      </td>

                      {/* Status */}
                      <td className="p-3 border-r border-black/10">
                        <StatusBadge status={b.onchainStatus} />
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/bounty/${b.onchainId || b.id}`}
                            className="border border-black p-1 hover:bg-yellow-300"
                            title="Inspect Bounty"
                          >
                            <Eye size={13} />
                          </Link>
                          {b.txHash && (
                            <a
                              href={`${ARC_EXPLORER_URL}/tx/${b.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="border border-black p-1 hover:bg-yellow-300"
                              title="View Creation Tx"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="p-3 bg-gray-50">
              <Pagination
                currentPage={bountyPage}
                totalPages={Math.max(1, Math.ceil(bountiesTotal / bountyPageSize))}
                totalItems={bountiesTotal}
                pageSize={bountyPageSize}
                pageSizeOptions={[10, 25, 50]}
                onPageChange={(p) => setBountyPage(p)}
                onPageSizeChange={(sz) => {
                  setBountyPageSize(sz)
                  setBountyPage(1)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 3: ALL SUBMISSIONS MONITOR */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by submitter address, bounty title, or PR link…"
                value={submissionSearch}
                onChange={(e) => {
                  setSubmissionSearch(e.target.value)
                  setSubmissionPage(1)
                }}
                className="w-full border-2 border-black pl-9 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-gray-500" />
              <select
                value={submissionStatusFilter}
                onChange={(e) => {
                  setSubmissionStatusFilter(e.target.value)
                  setSubmissionPage(1)
                }}
                className="border-2 border-black bg-white px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-yellow-400"
              >
                <option value="all">All Submissions</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="border-2 border-black bg-white shadow-[4px_4px_0px_black] overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-yellow-300 border-b-2 border-black font-black uppercase tracking-wider text-[11px]">
                  <th className="p-3 border-r border-black/30">Submitter</th>
                  <th className="p-3 border-r border-black/30">Target Bounty</th>
                  <th className="p-3 border-r border-black/30">Work Link (PR)</th>
                  <th className="p-3 border-r border-black/30">Notes</th>
                  <th className="p-3 border-r border-black/30">Status</th>
                  <th className="p-3 border-r border-black/30">Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {submissionsLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      Loading submissions from database…
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      No submissions match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  submissions.map((s) => (
                    <tr key={s.id} className="hover:bg-yellow-50/50 transition-colors">
                      {/* Submitter Wallet */}
                      <td className="p-3 font-mono border-r border-black/10">
                        <div className="flex items-center gap-1.5">
                          <span>
                            {s.submitterWallet.slice(0, 6)}…{s.submitterWallet.slice(-4)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(s.submitterWallet, `sub-${s.id}`)}
                            className="text-gray-400 hover:text-black"
                            title="Copy submitter wallet"
                          >
                            {copiedId === `sub-${s.id}` ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                          </button>
                        </div>
                        {s.submitterEmail && <span className="text-[10px] text-gray-500 block truncate">{s.submitterEmail}</span>}
                      </td>

                      {/* Target Bounty */}
                      <td className="p-3 border-r border-black/10 max-w-[200px]">
                        <Link
                          to={`/bounty/${s.onchainId || s.bountyId}`}
                          className="font-bold hover:underline truncate block"
                        >
                          {s.bountyTitle}
                        </Link>
                        <span className="text-[10px] text-gray-500">Reward: {s.bountyReward} USDC</span>
                      </td>

                      {/* PR Link */}
                      <td className="p-3 border-r border-black/10">
                        <a
                          href={s.pullRequestUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:underline font-mono text-[11px]"
                        >
                          <span>PR / Work</span>
                          <ExternalLink size={11} />
                        </a>
                      </td>

                      {/* Notes Preview */}
                      <td className="p-3 border-r border-black/10 max-w-[200px]">
                        <button
                          onClick={() => setViewingNotes(s)}
                          className="text-left hover:underline text-gray-700 truncate block w-full"
                          title="Click to view full notes"
                        >
                          {s.description}
                        </button>
                      </td>

                      {/* Status */}
                      <td className="p-3 border-r border-black/10">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border border-black ${
                            s.status === 'approved'
                              ? 'bg-green-300'
                              : s.status === 'rejected'
                              ? 'bg-red-300'
                              : 'bg-yellow-300'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="p-3 border-r border-black/10 text-gray-500 tabular-nums">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingNotes(s)}
                            className="border border-black p-1 hover:bg-yellow-300"
                            title="Inspect Details"
                          >
                            <Eye size={13} />
                          </button>
                          {s.txHash && (
                            <a
                              href={`${ARC_EXPLORER_URL}/tx/${s.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="border border-black p-1 hover:bg-yellow-300"
                              title="View Submission Tx"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="p-3 bg-gray-50">
              <Pagination
                currentPage={submissionPage}
                totalPages={Math.max(1, Math.ceil(submissionsTotal / submissionPageSize))}
                totalItems={submissionsTotal}
                pageSize={submissionPageSize}
                pageSizeOptions={[10, 25, 50]}
                onPageChange={(p) => setSubmissionPage(p)}
                onPageSizeChange={(sz) => {
                  setSubmissionPageSize(sz)
                  setSubmissionPage(1)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 4: AUDIT ACTIVITY LOG */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'activity' && (
        <div className="border-2 border-black bg-white shadow-[4px_4px_0px_black] overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-yellow-300 border-b-2 border-black font-black uppercase tracking-wider text-[11px]">
                <th className="p-3 border-r border-black/30">Action</th>
                <th className="p-3 border-r border-black/30">Description</th>
                <th className="p-3 border-r border-black/30">Actor Wallet</th>
                <th className="p-3 border-r border-black/30">Timestamp</th>
                <th className="p-3 text-right">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {activityLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    Loading audit activity log…
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No activity recorded yet.
                  </td>
                </tr>
              ) : (
                activities.map((a) => (
                  <tr key={a.id} className="hover:bg-yellow-50/50 transition-colors">
                    <td className="p-3 border-r border-black/10">
                      <span className="font-mono uppercase font-black text-[10px] bg-black text-white px-2 py-0.5">
                        {a.action}
                      </span>
                    </td>
                    <td className="p-3 border-r border-black/10 max-w-md font-medium text-gray-800">
                      {a.description}
                    </td>
                    <td className="p-3 border-r border-black/10 font-mono text-gray-600">
                      {a.actorWallet ? `${a.actorWallet.slice(0, 6)}…${a.actorWallet.slice(-4)}` : 'Platform'}
                    </td>
                    <td className="p-3 border-r border-black/10 text-gray-500 tabular-nums">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      {a.txHash ? (
                        <a
                          href={`${ARC_EXPLORER_URL}/tx/${a.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-black font-bold hover:underline"
                        >
                          <ExternalLink size={12} />
                          <span>Tx</span>
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Activity Pagination */}
          <div className="p-3 bg-gray-50">
            <Pagination
              currentPage={activityPage}
              totalPages={Math.max(1, Math.ceil(activityTotal / activityPageSize))}
              totalItems={activityTotal}
              pageSize={activityPageSize}
              pageSizeOptions={[15, 30, 50]}
              onPageChange={(p) => setActivityPage(p)}
              onPageSizeChange={(sz) => {
                setActivityPageSize(sz)
                setActivityPage(1)
              }}
            />
          </div>
        </div>
      )}

      {/* Submission Detail Modal */}
      {viewingNotes && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black max-w-lg w-full p-6 shadow-[8px_8px_0px_black] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div>
                <h3 className="font-display font-black text-lg">Submission Details</h3>
                <p className="text-xs text-gray-500">ID: {viewingNotes.id}</p>
              </div>
              <button
                onClick={() => setViewingNotes(null)}
                className="border-2 border-black p-1 hover:bg-yellow-300 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-gray-600 block mb-0.5">Target Bounty:</span>
                <span className="font-bold text-sm">{viewingNotes.bountyTitle}</span>
              </div>

              <div>
                <span className="font-bold text-gray-600 block mb-0.5">Submitter Wallet:</span>
                <span className="font-mono bg-gray-100 p-1.5 border border-black/20 block select-all">
                  {viewingNotes.submitterWallet}
                </span>
              </div>

              <div>
                <span className="font-bold text-gray-600 block mb-0.5">Pull Request URL:</span>
                <a
                  href={viewingNotes.pullRequestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1 font-mono break-all"
                >
                  {viewingNotes.pullRequestUrl}
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              </div>

              <div>
                <span className="font-bold text-gray-600 block mb-0.5">Contributor Notes:</span>
                <div className="bg-gray-50 border-2 border-black p-3 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {viewingNotes.description}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t-2 border-black/10 flex justify-end">
              <button
                onClick={() => setViewingNotes(null)}
                className="bg-yellow-300 border-2 border-black px-4 py-1.5 font-bold text-xs uppercase hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_black]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

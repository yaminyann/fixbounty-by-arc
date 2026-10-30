/* oxlint-disable react/set-state-in-effect */
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import {
  Plus,
  Wallet,
  RefreshCw,
  FolderPlus,
  Send,
  DollarSign,
  ExternalLink,
  FileText,
  History,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { useBountyCount, useBounties } from '@/hooks/useBounty'
import { BountyCard } from '@/components/ui/BountyCard'
import { useAuth } from '@/contexts/AuthContext'
import { BountyStatus, parseOnchainError, formatAddress, timeAgo } from '@/lib/bountyTypes'
import { BOUNTY_BOARD_ADDRESS, BOUNTY_BOARD_ABI, explorerTx } from '@/lib/contract'
import {
  getSubmissionsByContributor,
  getBountiesByCreator,
  getRecentBountyMetas,
  type SubmissionMeta,
  type BountyMeta,
} from '@/lib/firestore'
import {
  apiGetCreatorBounties,
  apiGetContributorSubmissions,
  apiGetActivity,
  type ApiActivity,
} from '@/lib/api'
import { ConnectKitButton } from 'connectkit'
import { NetworkGuard } from '@/components/ui/NetworkGuard'

const TYPE_LABELS: Record<string, string> = {
  created: 'Bounty Created',
  funded: 'Bounty Funded',
  submitted: 'Work Submitted',
  approved: 'Contributor Approved',
  claimed: 'Reward Claimed',
  refunded: 'Bounty Refunded',
  cancelled: 'Bounty Cancelled',
  metadata_updated: 'Details Updated',
}

const TYPE_COLORS: Record<string, string> = {
  created: 'bg-yellow-300 text-black',
  funded: 'bg-green-300 text-black',
  submitted: 'bg-blue-200 text-black',
  approved: 'bg-blue-400 text-black',
  claimed: 'bg-black text-white',
  refunded: 'bg-red-200 text-red-900',
  cancelled: 'bg-gray-200 text-gray-500',
  metadata_updated: 'bg-purple-200 text-purple-900',
}

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: 'created' | 'submitted' | 'history' =
    tabParam === 'submitted' ? 'submitted' : tabParam === 'history' ? 'history' : 'created'

  const { user, signInWithGoogle, loading: authLoading } = useAuth()
  const { address, isConnected } = useAccount()

  const { count, isLoading: countLoading, refetch: refetchCount } = useBountyCount()
  const allIds = useMemo(() => Array.from({ length: count }, (_, i) => count - i), [count])
  const { bounties, isLoading: bountiesLoading, refetch: refetchBounties } = useBounties(allIds)

  const [mySubmissions, setMySubmissions] = useState<SubmissionMeta[]>([])
  const [metas, setMetas] = useState<Record<number, BountyMeta>>({})
  const [loadingData, setLoadingData] = useState(true)

  // History state
  const [activities, setActivities] = useState<ApiActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [activityTotal, setActivityTotal] = useState(0)
  const [hasMoreActivity, setHasMoreActivity] = useState(false)
  const [activityOffset, setActivityOffset] = useState(0)

  // Track latest request to avoid race conditions
  const activeRequestRef = useRef(0)

  // Cancel action for unfunded Open bounties
  const { writeContract: cancelWrite, data: cancelHash, isPending: cancelPending } = useWriteContract()
  const { isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash })

  useEffect(() => {
    if (cancelSuccess) {
      void refetchBounties()
      void refetchCount()
    }
  }, [cancelSuccess, refetchBounties, refetchCount])

  // Load user-scoped activity history with pagination and error recovery
  const loadHistoryData = useCallback(
    async (offset = 0, isAppend = false) => {
      const identifier = address ? address.toLowerCase() : user?.uid
      if (!identifier) {
        setActivities([])
        setActivityLoading(false)
        return
      }

      setActivityLoading(true)
      setActivityError(null)

      try {
        const res = await apiGetActivity({
          actor: identifier,
          limit: 15,
          offset,
        })

        if (isAppend) {
          setActivities((prev) => [...prev, ...res.activity])
        } else {
          setActivities(res.activity)
        }

        setActivityTotal(res.total)
        setHasMoreActivity(res.hasMore)
        setActivityOffset(offset + res.activity.length)
      } catch (err) {
        console.warn('[Dashboard] History loading warning:', err)
        setActivityError('Could not retrieve activity history. Click retry to recover.')
      } finally {
        setActivityLoading(false)
      }
    },
    [address, user]
  )

  // Load PostgreSQL submissions, bounties, and metadata (Fast first-pass, then background cache)
  const loadDashboardData = useCallback(async () => {
    if (!user) {
      setLoadingData(false)
      return
    }

    const currentRequestId = ++activeRequestRef.current
    setLoadingData(true)

    try {
      const identifier = address ? address.toLowerCase() : user.uid

      // 1. FAST PATH: Query PostgreSQL backend in parallel
      const [apiBounties, apiSubs] = await Promise.all([
        apiGetCreatorBounties(identifier).catch((err) => {
          console.warn('[Dashboard] apiGetCreatorBounties failed:', err)
          return []
        }),
        apiGetContributorSubmissions(identifier).catch((err) => {
          console.warn('[Dashboard] apiGetContributorSubmissions failed:', err)
          return []
        }),
      ])

      // If a newer request has started, discard this result
      if (currentRequestId !== activeRequestRef.current) return

      // Map PostgreSQL submissions
      const mappedApiSubs: SubmissionMeta[] = apiSubs.map((s) => ({
        bountyId: s.onchainBountyId || 0,
        contributorUid: s.submitterUserId || user.uid,
        contributorAddress: s.submitterWallet,
        submissionHash: s.txHash || '',
        description: s.description,
        links: s.attachments && s.attachments.length > 0 ? s.attachments : [s.pullRequestUrl],
        submittedAt: s.createdAt,
        status: s.status,
      }))

      // Merge PostgreSQL metadata immediately
      const initialMap: Record<number, BountyMeta> = {}
      for (const b of apiBounties) {
        if (b.onchainId) {
          initialMap[b.onchainId] = {
            bountyId: b.onchainId,
            creatorAddress: b.creatorWallet,
            creatorUid: b.creatorUserId || user.uid,
            description: b.description,
            acceptanceCriteria: b.acceptanceCriteria,
            tags: b.tags,
            links: b.links,
          }
        }
      }

      setMySubmissions(mappedApiSubs)
      setMetas(initialMap)
      setLoadingData(false)

      // Also start loading activity history in parallel
      void loadHistoryData(0, false)

      // 2. BACKGROUND ENRICHMENT: Optional Firestore augment (non-blocking)
      void Promise.all([
        getSubmissionsByContributor(user.uid, address).catch(() => []),
        getBountiesByCreator(user.uid, address).catch(() => []),
        getRecentBountyMetas(50).catch(() => []),
      ]).then(([submissions, creatorMetas, allRecentMetas]) => {
        if (currentRequestId !== activeRequestRef.current) return

        // Merge submissions uniquely by bountyId
        const allSubsMap = new Map<number, SubmissionMeta>()
        for (const s of mappedApiSubs) allSubsMap.set(s.bountyId, s)
        for (const s of submissions) {
          if (!allSubsMap.has(s.bountyId)) allSubsMap.set(s.bountyId, s)
        }
        setMySubmissions(Array.from(allSubsMap.values()))

        // Merge secondary metadata
        setMetas((prev) => {
          const updated = { ...prev }
          for (const m of allRecentMetas) {
            if (!updated[m.bountyId]) updated[m.bountyId] = m
          }
          for (const m of creatorMetas) {
            if (!updated[m.bountyId]) updated[m.bountyId] = m
          }
          return updated
        })
      })
    } catch (err) {
      console.error('[Dashboard] Error loading data:', err)
      if (currentRequestId === activeRequestRef.current) {
        setLoadingData(false)
      }
    }
  }, [user, address, loadHistoryData])

  // oxlint-disable-next-line react/set-state-in-effect
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  // Merge onchain created bounties with PostgreSQL/Firestore creator metadata
  const myBounties = useMemo(() => {
    const matchedIds = new Set<number>()

    // 1. Matches by wallet address
    for (const b of bounties) {
      if (address && b.creator.toLowerCase() === address.toLowerCase()) {
        matchedIds.add(b.id)
      }
    }

    // 2. Matches by creatorUid
    if (user) {
      for (const [idStr, m] of Object.entries(metas)) {
        if (m.creatorUid === user.uid) {
          matchedIds.add(Number(idStr))
        }
      }
    }

    return bounties.filter((b) => matchedIds.has(b.id))
  }, [bounties, address, user, metas])

  // Calculate user metrics
  const totalCreatedUsdc = useMemo(() => {
    return myBounties.reduce((acc, b) => acc + Number(b.rewardFormatted), 0)
  }, [myBounties])

  const submittedBountyIds = useMemo(() => {
    return new Set(mySubmissions.map((s) => s.bountyId))
  }, [mySubmissions])

  const submittedBountiesMap = useMemo(() => {
    const map = new Map<number, (typeof bounties)[0]>()
    for (const b of bounties) {
      if (submittedBountyIds.has(b.id)) {
        map.set(b.id, b)
      }
    }
    return map
  }, [bounties, submittedBountyIds])

  const handleCancel = (bountyId: number) => {
    cancelWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'cancelBounty',
        args: [BigInt(bountyId)],
      },
      {
        onSuccess: () => toast.success(`Bounty #${bountyId} cancelled.`),
        onError: (err) => toast.error(parseOnchainError(err)),
      }
    )
  }

  const handleRefresh = () => {
    void refetchCount()
    void refetchBounties()
    void loadDashboardData()
    void loadHistoryData(0, false)
    toast.info('Dashboard refreshed.')
  }

  if (authLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 bg-gray-200 animate-pulse border-2 border-black" />
        <div className="h-44 bg-gray-100 animate-pulse border-2 border-black" />
      </div>
    )
  }

  // Not signed in with Google
  if (!user) {
    return (
      <div className="max-w-md mx-auto text-center pt-8 pb-12">
        <div className="border-2 border-black p-8 bg-white shadow-[6px_6px_0px_black] space-y-4">
          <div className="w-12 h-12 bg-yellow-300 border-2 border-black flex items-center justify-center mx-auto shadow-[2px_2px_0px_black]">
            <FolderPlus size={24} />
          </div>
          <h2 className="font-display font-bold text-xl">Sign in to your Dashboard</h2>
          <p className="text-sm text-gray-600">
            Sign in with Google to view your created bounties, track submissions, and review your activity history.
          </p>
          <button
            onClick={() => void signInWithGoogle()}
            className="w-full border-2 border-black bg-black text-white py-3.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_#EAB308]"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header and User Identity */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-2xl tracking-tight">Dashboard</h1>
            <span className="text-xs font-bold px-2 py-0.5 bg-yellow-300 border border-black">
              {user.displayName ?? user.email}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Wallet: {address ? formatAddress(address) : 'Not connected'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRefresh}
            className="border-2 border-black p-2 bg-white hover:bg-yellow-300 transition-colors shadow-[2px_2px_0px_black]"
            title="Refresh dashboard and history"
          >
            <RefreshCw size={16} />
          </button>
          <Link
            to="/create"
            className="border-2 border-black bg-black text-white px-4 py-2 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all flex items-center gap-2 shadow-[2px_2px_0px_#EAB308]"
          >
            <Plus size={16} /> Post Bounty
          </Link>
        </div>
      </div>

      {!isConnected && (
        <div className="border-2 border-black bg-yellow-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[2px_2px_0px_black]">
          <div className="flex items-center gap-2 text-sm font-bold text-yellow-900">
            <Wallet size={18} />
            <span>Connect your Arc Testnet wallet to view onchain created bounties and submit work.</span>
          </div>
          <ConnectKitButton />
        </div>
      )}

      <NetworkGuard>
        <span />
      </NetworkGuard>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">My Bounties</span>
          <p className="font-display font-bold text-3xl mt-2 tabular-nums">{myBounties.length}</p>
          <p className="text-xs text-gray-500 mt-1">Created on Arc Testnet</p>
        </div>
        <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Reward Value</span>
          <p className="font-display font-bold text-3xl mt-2 tabular-nums text-green-700">
            ${totalCreatedUsdc.toFixed(2)} <span className="text-sm font-bold text-black">USDC</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">Escrowed or claimed</p>
        </div>
        <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">My Submissions</span>
          <p className="font-display font-bold text-3xl mt-2 tabular-nums">{mySubmissions.length}</p>
          <p className="text-xs text-gray-500 mt-1">Submitted as contributor</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row border-2 border-black w-full sm:w-fit bg-white shadow-[2px_2px_0px_black]">
        <button
          onClick={() => setSearchParams({ tab: 'created' })}
          className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold capitalize border-b-2 sm:border-b-0 sm:border-r-2 border-black transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === 'created' ? 'bg-black text-white' : 'bg-white hover:bg-yellow-300'
          }`}
        >
          <FolderPlus size={16} />
          Created Bounties ({myBounties.length})
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'submitted' })}
          className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold capitalize border-b-2 sm:border-b-0 sm:border-r-2 border-black transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === 'submitted' ? 'bg-black text-white' : 'bg-white hover:bg-yellow-300'
          }`}
        >
          <Send size={16} />
          My Submissions ({mySubmissions.length})
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'history' })}
          className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold capitalize transition-colors flex items-center justify-center sm:justify-start gap-2 ${
            activeTab === 'history' ? 'bg-black text-white' : 'bg-white hover:bg-yellow-300'
          }`}
        >
          <History size={16} />
          Activity History ({activityTotal || activities.length})
        </button>
      </div>

      {/* TAB CONTENT: CREATED BOUNTIES */}
      {activeTab === 'created' && (
        <div className="space-y-4">
          {bountiesLoading || countLoading || loadingData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 border-2 border-black bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : myBounties.length === 0 ? (
            <div className="border-2 border-black p-12 text-center bg-white shadow-[4px_4px_0px_black] space-y-3">
              <div className="w-12 h-12 bg-yellow-300 border-2 border-black flex items-center justify-center mx-auto text-xl font-bold">
                !
              </div>
              <h3 className="font-display font-bold text-lg">No created bounties yet</h3>
              <p className="text-sm text-gray-600 max-w-sm mx-auto">
                Post your first open-source issue or bug fix with USDC rewards to coordinate contributors.
              </p>
              <Link
                to="/create"
                className="inline-flex items-center gap-2 border-2 border-black bg-black text-white px-5 py-2.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_#EAB308]"
              >
                <Plus size={16} /> Post a Bounty
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myBounties.map((b) => (
                <div key={b.id} className="space-y-2">
                  <BountyCard bounty={b} tags={metas[b.id]?.tags ?? []} />
                  {b.status === BountyStatus.Open && (
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={cancelPending}
                      className="w-full border-2 border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-40"
                    >
                      {cancelPending ? 'Cancelling…' : 'Cancel Unfunded Bounty'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SUBMISSIONS */}
      {activeTab === 'submitted' && (
        <div className="space-y-4">
          {loadingData ? (
            <div className="h-32 border-2 border-black bg-gray-100 animate-pulse" />
          ) : mySubmissions.length === 0 ? (
            <div className="border-2 border-black p-12 text-center bg-white shadow-[4px_4px_0px_black] space-y-3">
              <div className="w-12 h-12 bg-yellow-300 border-2 border-black flex items-center justify-center mx-auto text-xl font-bold">
                <FileText size={22} />
              </div>
              <h3 className="font-display font-bold text-lg">No work submitted yet</h3>
              <p className="text-sm text-gray-600 max-w-sm mx-auto">
                Explore open bounties on Arc Testnet, fix issues, and submit your pull request to earn USDC.
              </p>
              <Link
                to="/explore"
                className="inline-flex items-center gap-2 border-2 border-black bg-black text-white px-5 py-2.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_#EAB308]"
              >
                Browse Open Bounties
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {mySubmissions.map((sub, idx) => {
                const linkedBounty = submittedBountiesMap.get(sub.bountyId)
                const isApproved =
                  linkedBounty &&
                  address &&
                  linkedBounty.approvedContributor.toLowerCase() === address.toLowerCase()
                const isClaimed = linkedBounty?.status === BountyStatus.Claimed

                return (
                  <div
                    key={`${sub.bountyId}_${idx}`}
                    className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b-2 border-gray-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-base hover:underline">
                            <Link to={`/bounty/${sub.bountyId}`}>
                              Bounty #{sub.bountyId}: {linkedBounty?.title ?? `Bounty #${sub.bountyId}`}
                            </Link>
                          </span>
                          {isClaimed ? (
                            <span className="px-2 py-0.5 text-xs font-bold bg-black text-white">Claimed</span>
                          ) : isApproved ? (
                            <span className="px-2 py-0.5 text-xs font-bold bg-green-400 text-black animate-pulse">
                              Approved for Payout
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs font-bold bg-yellow-300 text-black">
                              Pending Review
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Submitted {sub.submittedAt ? timeAgo(sub.submittedAt) : 'recently'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {linkedBounty && (
                          <span className="font-bold text-sm text-green-700 flex items-center gap-1">
                            <DollarSign size={14} />
                            {linkedBounty.rewardFormatted} USDC
                          </span>
                        )}
                        <Link
                          to={`/bounty/${sub.bountyId}`}
                          className="border-2 border-black px-3 py-1 text-xs font-bold hover:bg-yellow-300 transition-colors"
                        >
                          View Bounty
                        </Link>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                        Work Summary
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{sub.description}</p>
                    </div>

                    {sub.links.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                          Submission Links
                        </p>
                        <ul className="space-y-1">
                          {sub.links.map((link, lIdx) => (
                            <li key={lIdx}>
                              <a
                                href={link.startsWith('http') ? link : `https://${link}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                <ExternalLink size={12} />
                                {link}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: HISTORY & ACTIVITY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {activityError && (
            <div className="border-2 border-black bg-red-50 p-4 flex items-center justify-between gap-3 shadow-[2px_2px_0px_black]">
              <div className="flex items-center gap-2 text-sm text-red-800 font-medium">
                <AlertCircle size={18} className="shrink-0 text-red-600" />
                <span>{activityError}</span>
              </div>
              <button
                onClick={() => void loadHistoryData(0, false)}
                className="border-2 border-black bg-white px-3 py-1 text-xs font-bold hover:bg-yellow-300 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {activityLoading && activities.length === 0 ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 border-2 border-black bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="border-2 border-black p-12 text-center bg-white shadow-[4px_4px_0px_black] space-y-3">
              <div className="w-12 h-12 bg-yellow-300 border-2 border-black flex items-center justify-center mx-auto text-xl font-bold">
                <History size={22} />
              </div>
              <h3 className="font-display font-bold text-lg">No activity history recorded</h3>
              <p className="text-sm text-gray-600 max-w-sm mx-auto">
                Actions like creating bounties, funding rewards, submitting work, and claims will appear in your timeline.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Link
                  to="/create"
                  className="inline-flex items-center gap-1.5 border-2 border-black bg-black text-white px-4 py-2 font-bold text-xs hover:bg-yellow-300 hover:text-black transition-all"
                >
                  <Plus size={14} /> Post Bounty
                </Link>
                <Link
                  to="/explore"
                  className="inline-flex items-center gap-1.5 border-2 border-black bg-white text-black px-4 py-2 font-bold text-xs hover:bg-yellow-300 transition-all"
                >
                  Browse Open Bounties
                </Link>
              </div>
            </div>
          ) : (
            <div className="border-2 border-black bg-white shadow-[4px_4px_0px_black] divide-y-2 divide-gray-100">
              {activities.map((a, i) => (
                <div key={a.id || i} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-yellow-50/40 transition-colors">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span
                      className={`px-2.5 py-1 text-xs font-bold border border-black shrink-0 ${
                        TYPE_COLORS[a.action] || 'bg-gray-200 text-black'
                      }`}
                    >
                      {TYPE_LABELS[a.action] || a.action}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {a.bountyTitle ? a.bountyTitle : a.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                        {a.onchainId && (
                          <span className="font-semibold text-black">
                            Bounty #{a.onchainId}
                          </span>
                        )}
                        {a.actorWallet && (
                          <span className="font-mono text-gray-600">
                            by {formatAddress(a.actorWallet)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {timeAgo(a.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {a.txHash && (
                      <a
                        href={explorerTx(a.txHash as `0x${string}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 border border-black bg-gray-50 px-2 py-1 text-xs font-mono hover:bg-yellow-300 transition-colors"
                        title="View transaction on Arc Testnet Explorer"
                      >
                        Tx: {a.txHash.slice(0, 6)}…
                        <ExternalLink size={11} />
                      </a>
                    )}
                    {a.onchainId && (
                      <Link
                        to={`/bounty/${a.onchainId}`}
                        className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-1 text-xs font-bold hover:bg-yellow-300 transition-colors"
                      >
                        View
                        <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}

              {hasMoreActivity && (
                <div className="p-3 text-center bg-gray-50">
                  <button
                    onClick={() => void loadHistoryData(activityOffset, true)}
                    disabled={activityLoading}
                    className="border-2 border-black bg-white px-4 py-1.5 text-xs font-bold hover:bg-yellow-300 transition-colors disabled:opacity-50"
                  >
                    {activityLoading ? 'Loading more…' : 'Load More History'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

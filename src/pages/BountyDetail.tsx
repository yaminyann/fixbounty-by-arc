import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  ExternalLink,
  Clock,
  User,
  DollarSign,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { useBounty } from '@/hooks/useBounty'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { NetworkGuard } from '@/components/ui/NetworkGuard'
import {
  BountyStatus,
  formatAddress,
  timeUntil,
  timeAgo,
  parseOnchainError,
} from '@/lib/bountyTypes'
import {
  BOUNTY_BOARD_ADDRESS,
  BOUNTY_BOARD_ABI,
  USDC_ADDRESS,
  TARGET_CHAIN_ID,
  explorerAddr,
} from '@/lib/contract'
import {
  getBountyMeta,
  getSubmissionsForBounty,
  saveSubmissionMeta,
  saveBountyMeta,
  logActivity,
  type BountyMeta,
  type SubmissionMeta,
} from '@/lib/firestore'
import {
  apiGetBounty,
  apiGetBountySubmissions,
  apiCreateSubmission,
  apiUpdateBounty,
  apiRecordActivity,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export function BountyDetail() {
  const { id } = useParams<{ id: string }>()
  const bountyId = Number(id)
  const { user, signInWithGoogle } = useAuth()
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const { bounty, isLoading, refetch } = useBounty(bountyId)
  const [meta, setMeta] = useState<BountyMeta | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionMeta[]>([])
  const [submissionText, setSubmissionText] = useState('')
  const [submissionLinks, setSubmissionLinks] = useState('')
  const [showSubmitForm, setShowSubmitForm] = useState(false)

  // Creator metadata editing state (for bounties needing off-chain description)
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaForm, setMetaForm] = useState({
    description: '',
    acceptanceCriteria: '',
    tags: '',
  })
  const [savingMeta, setSavingMeta] = useState(false)

  const reloadOffChainData = async () => {
    if (!bountyId) return
    try {
      // 1. Load from PostgreSQL backend
      const [apiBounty, apiSubs] = await Promise.all([
        apiGetBounty(bountyId),
        apiGetBountySubmissions(bountyId),
      ])

      if (apiBounty) {
        setMeta({
          bountyId,
          creatorUid: apiBounty.creatorUserId || 'anonymous',
          creatorAddress: apiBounty.creatorWallet,
          description: apiBounty.description,
          acceptanceCriteria: apiBounty.acceptanceCriteria,
          tags: apiBounty.tags,
          links: apiBounty.links,
        })
        setMetaForm({
          description: apiBounty.description,
          acceptanceCriteria: apiBounty.acceptanceCriteria,
          tags: apiBounty.tags.join(', '),
        })
      } else {
        // Fallback to Firestore and local cache
        const m = await getBountyMeta(bountyId)
        setMeta(m)
        if (m) {
          setMetaForm({
            description: m.description,
            acceptanceCriteria: m.acceptanceCriteria,
            tags: m.tags.join(', '),
          })
        }
      }

      if (apiSubs.submissions && apiSubs.submissions.length > 0) {
        setSubmissions(
          apiSubs.submissions.map((s) => ({
            bountyId,
            contributorUid: s.submitterUserId || 'unknown',
            contributorAddress: s.submitterWallet,
            submissionHash: s.txHash || '',
            description: s.description,
            links: s.attachments && s.attachments.length > 0 ? s.attachments : [s.pullRequestUrl],
            submittedAt: s.createdAt,
            status: s.status,
          }))
        )
      } else {
        const subs = await getSubmissionsForBounty(bountyId)
        setSubmissions(subs)
      }
    } catch (err) {
      console.error('[BountyDetail] Error loading metadata:', err)
    }
  }

  const handleSaveMetadata = async () => {
    if (!bountyId) return
    setSavingMeta(true)
    try {
      const tagsArray = metaForm.tags.split(',').map((t) => t.trim()).filter(Boolean)

      // 1. Persist directly to PostgreSQL
      await apiUpdateBounty(bountyId, {
        description: metaForm.description,
        acceptanceCriteria: metaForm.acceptanceCriteria,
        tags: tagsArray,
      }).catch((e) => console.warn('[BountyDetail] PostgreSQL update error:', e))

      // 2. Persist to Firestore & local storage
      await saveBountyMeta(bountyId, {
        creatorUid: user?.uid ?? 'anonymous',
        creatorAddress: address?.toLowerCase() ?? bounty?.creator.toLowerCase(),
        description: metaForm.description,
        acceptanceCriteria: metaForm.acceptanceCriteria,
        tags: tagsArray,
      })

      setMeta({
        bountyId,
        creatorUid: user?.uid ?? 'anonymous',
        creatorAddress: address?.toLowerCase() ?? bounty?.creator.toLowerCase(),
        description: metaForm.description,
        acceptanceCriteria: metaForm.acceptanceCriteria,
        tags: tagsArray,
      })
      setEditingMeta(false)
      toast.success('Bounty details saved and synchronized!')
    } catch (err) {
      toast.error('Failed to save metadata: ' + (err as Error).message)
    } finally {
      setSavingMeta(false)
    }
  }

  useEffect(() => {
    void reloadOffChainData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bountyId])

  // Submit work
  const { writeContract: submitWrite, data: submitHash, isPending: submitPending } = useWriteContract()
  const { isLoading: submitConfirming, isSuccess: submitSuccess } = useWaitForTransactionReceipt({ hash: submitHash })

  // Approve
  const { writeContract: approveWrite, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  // Claim
  const { writeContract: claimWrite, data: claimHash, isPending: claimPending } = useWriteContract()
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimHash })

  // Refund (funded + expired)
  const { writeContract: refundWrite, data: refundHash, isPending: refundPending } = useWriteContract()
  const { isLoading: refundConfirming, isSuccess: refundSuccess } = useWaitForTransactionReceipt({ hash: refundHash })

  // RefundAfterApproval
  const { writeContract: refundApprovalWrite, data: refundApprovalHash, isPending: refundApprovalPending } = useWriteContract()
  const { isLoading: refundApprovalConfirming, isSuccess: refundApprovalSuccess } = useWaitForTransactionReceipt({ hash: refundApprovalHash })

  // Fund open bounty
  const { writeContract: usdcApproveWrite, isPending: usdcApprovePending } = useWriteContract()
  const { writeContract: fundWrite, data: fundHash, isPending: fundPending } = useWriteContract()
  const { isLoading: fundConfirming, isSuccess: fundSuccess } = useWaitForTransactionReceipt({ hash: fundHash })

  useEffect(() => {
    if (submitSuccess || approveSuccess || claimSuccess || refundSuccess || refundApprovalSuccess || fundSuccess) {
      void refetch()
      void reloadOffChainData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitSuccess, approveSuccess, claimSuccess, refundSuccess, refundApprovalSuccess, fundSuccess])

  const isCreator = Boolean(
    bounty && address && bounty.creator.toLowerCase() === address.toLowerCase()
  )
  const isApproved = Boolean(
    bounty && address && bounty.approvedContributor.toLowerCase() === address.toLowerCase()
  )

  const canSubmit =
    bounty &&
    isConnected &&
    !isCreator &&
    bounty.status === BountyStatus.Funded &&
    !bounty.isExpired

  const canApprove =
    bounty &&
    isCreator &&
    bounty.status === BountyStatus.Funded

  const canClaim =
    bounty &&
    isApproved &&
    bounty.status === BountyStatus.Approved

  const canRefund =
    bounty &&
    isCreator &&
    bounty.status === BountyStatus.Funded &&
    bounty.isExpired

  const canRefundAfterApproval =
    bounty &&
    isCreator &&
    bounty.status === BountyStatus.Approved

  const GRACE = 7 * 24 * 3600 // 7 days in seconds
  const graceCutoff = bounty ? new Date(bounty.deadline.getTime() + GRACE * 1000) : null
  const graceExpired = graceCutoff ? graceCutoff < new Date() : false

  const checkChain = () => {
    if (chainId !== TARGET_CHAIN_ID) {
      switchChain({ chainId: TARGET_CHAIN_ID })
      return false
    }
    return true
  }

  // Handle Contributor Submission
  const handleSubmit = () => {
    if (!user) {
      toast.error('Please sign in with Google first.')
      return
    }
    if (!checkChain() || !bounty || !address) return
    if (!submissionText.trim()) {
      toast.error('Please describe your work.')
      return
    }

    const contentHash = `sha256:${btoa(unescape(encodeURIComponent(submissionText))).slice(0, 32)}`
    submitWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'submitWork',
      args: [BigInt(bountyId), contentHash],
    }, {
      onSuccess: (hash) => {
        toast.success('Work submitted onchain!')
        setShowSubmitForm(false)

        void (async () => {
          // 1. Persist directly to PostgreSQL
          await apiCreateSubmission(bountyId, {
            submitterWallet: address.toLowerCase(),
            description: submissionText,
            pullRequestUrl: submissionLinks.split('\n')[0]?.trim() || 'https://github.com',
            attachments: submissionLinks.split('\n').map((l) => l.trim()).filter(Boolean),
            txHash: hash,
          }).catch((e) => console.warn('[BountyDetail] PostgreSQL submission warning:', e))

          // 2. Persist to Firestore fallback
          void saveSubmissionMeta({
            bountyId,
            contributorUid: user.uid,
            contributorAddress: address.toLowerCase(),
            submissionHash: contentHash,
            description: submissionText,
            links: submissionLinks.split('\n').map((l) => l.trim()).filter(Boolean),
          })

          // 3. Record in PostgreSQL activity table
          void apiRecordActivity({
            onchainId: bountyId,
            action: 'submitted',
            actorWallet: address,
            description: `Work submitted by ${formatAddress(address)}`,
            txHash: hash,
          })

          setSubmissionText('')
          setSubmissionLinks('')
          void reloadOffChainData()
        })()
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  // Handle Creator Approval
  const handleApproveContributor = (contributorAddress: string) => {
    if (!checkChain()) return
    approveWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'approveBounty',
      args: [BigInt(bountyId), contributorAddress as `0x${string}`],
    }, {
      onSuccess: (hash) => {
        toast.success(`Approved ${formatAddress(contributorAddress)} for reward payout!`)
        if (address) {
          void apiRecordActivity({
            onchainId: bountyId,
            action: 'approved',
            actorWallet: address,
            description: `${formatAddress(contributorAddress)} approved for payout`,
            txHash: hash,
          })
          void logActivity({
            bountyId,
            type: 'approved',
            actorAddress: address,
            txHash: hash,
            message: `${formatAddress(contributorAddress)} approved for payout`,
          })
        }
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  // Handle Contributor Claim
  const handleClaim = () => {
    if (!checkChain()) return
    claimWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'claimReward',
      args: [BigInt(bountyId)],
    }, {
      onSuccess: (hash) => {
        toast.success(`Reward claimed! ${bounty?.rewardFormatted} USDC sent to your wallet.`)
        if (address) {
          void apiRecordActivity({
            onchainId: bountyId,
            action: 'claimed',
            actorWallet: address,
            description: `Reward claimed by ${formatAddress(address)}`,
            txHash: hash,
          })
          void logActivity({
            bountyId,
            type: 'claimed',
            actorAddress: address,
            txHash: hash,
            message: `Reward claimed by ${formatAddress(address)}`,
          })
        }
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  // Handle Creator Refund
  const handleRefund = () => {
    if (!checkChain()) return
    refundWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'refundBounty',
      args: [BigInt(bountyId)],
    }, {
      onSuccess: (hash) => {
        toast.success('Bounty refunded. Locked USDC returned to your wallet.')
        if (address) {
          void logActivity({
            bountyId,
            type: 'refunded',
            actorAddress: address,
            txHash: hash,
            message: `Bounty #${bountyId} refunded`,
          })
        }
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  // Handle Creator Refund after 7-day grace period
  const handleRefundAfterApproval = () => {
    if (!checkChain()) return
    refundApprovalWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'refundAfterApproval',
      args: [BigInt(bountyId)],
    }, {
      onSuccess: (hash) => {
        toast.success('Funds recovered after approval grace period elapsed.')
        if (address) {
          void logActivity({
            bountyId,
            type: 'refunded',
            actorAddress: address,
            txHash: hash,
            message: `Bounty #${bountyId} refunded after approval grace period`,
          })
        }
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  // Fund open bounty flow
  const handleFundOpen = () => {
    if (!bounty || !checkChain()) return
    usdcApproveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [BOUNTY_BOARD_ADDRESS, bounty.reward],
    }, {
      onSuccess: () => {
        toast.success('USDC approved! Now confirming escrow deposit…')
        fundWrite({
          address: BOUNTY_BOARD_ADDRESS,
          abi: BOUNTY_BOARD_ABI,
          functionName: 'fundBounty',
          args: [BigInt(bountyId)],
        }, {
          onSuccess: (hash) => {
            toast.success('Bounty funded and active!')
            if (address) {
              void logActivity({
                bountyId,
                type: 'funded',
                actorAddress: address,
                txHash: hash,
                message: `Bounty #${bountyId} funded`,
              })
            }
          },
          onError: (err) => toast.error(parseOnchainError(err)),
        })
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 animate-pulse border-2 border-black" />
        <div className="h-64 bg-gray-100 animate-pulse border-2 border-black" />
      </div>
    )
  }

  if (!bounty) {
    return (
      <div className="border-2 border-black p-10 text-center bg-white shadow-[6px_6px_0px_black] space-y-3">
        <AlertTriangle size={36} className="mx-auto text-yellow-500" />
        <h2 className="font-display font-bold text-xl">Bounty not found</h2>
        <p className="text-sm text-gray-500">
          No bounty with ID #{bountyId} exists on Arc Testnet contract.
        </p>
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 border-2 border-black bg-black text-white px-4 py-2 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-colors"
        >
          <ArrowLeft size={16} /> Back to Explorer
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Top Bar */}
      <div className="flex items-center gap-3">
        <Link
          to="/explore"
          className="border-2 border-black p-2 bg-white hover:bg-yellow-300 transition-colors shadow-[2px_2px_0px_black]"
          title="Back to bounties"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold bg-yellow-300 px-2 py-0.5 border border-black">
              #{bounty.id}
            </span>
            <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight">
              {bounty.title}
            </h1>
          </div>
        </div>
        <button
          onClick={() => {
            void refetch()
            void reloadOffChainData()
            toast.info('Bounty refreshed.')
          }}
          className="ml-auto border-2 border-black p-2 bg-white hover:bg-yellow-300 transition-colors shadow-[2px_2px_0px_black]"
          title="Refresh onchain state"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Main Info Card */}
      <div className="border-2 border-black bg-white shadow-[6px_6px_0px_black] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={bounty.status} />
            <span className="text-base font-bold text-green-700 flex items-center gap-1 tabular-nums">
              <DollarSign size={16} />
              {bounty.rewardFormatted} USDC
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <Clock size={14} />
            <span>{bounty.isExpired ? 'Expired' : timeUntil(bounty.deadline)}</span>
          </div>
        </div>

        {/* Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Creator Wallet</span>
            <div className="flex items-center gap-1.5 mt-1">
              <a
                href={explorerAddr(bounty.creator)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs hover:underline flex items-center gap-1 text-black font-medium"
              >
                {bounty.creator} <ExternalLink size={11} />
              </a>
              {isCreator && (
                <span className="bg-yellow-300 border border-black text-[10px] font-bold px-1.5 py-0.2">
                  You
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Deadline</span>
            <p className="mt-1 font-medium text-gray-900">
              {bounty.deadline.toLocaleDateString()} at {bounty.deadline.toLocaleTimeString()}
            </p>
          </div>

          {bounty.fundedAt && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Escrow Funded</span>
              <p className="mt-1 text-gray-800">{timeAgo(bounty.fundedAt)}</p>
            </div>
          )}

          {bounty.approvedContributor !== '0x0000000000000000000000000000000000000000' && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Approved Contributor</span>
              <div className="flex items-center gap-1.5 mt-1">
                <a
                  href={explorerAddr(bounty.approvedContributor)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs hover:underline flex items-center gap-1 text-green-700 font-bold"
                >
                  {formatAddress(bounty.approvedContributor)} <ExternalLink size={11} />
                </a>
                {isApproved && (
                  <span className="bg-green-300 border border-black text-[10px] font-bold px-1.5 py-0.2">
                    You
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Contract Link */}
        <div className="border-t-2 border-gray-100 pt-3 flex items-center justify-between text-xs text-gray-500">
          <span className="font-mono text-[11px]">
            Contract: {formatAddress(BOUNTY_BOARD_ADDRESS)}
          </span>
          <a
            href={explorerAddr(BOUNTY_BOARD_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black underline flex items-center gap-1"
          >
            Arc Explorer <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Description & Acceptance Criteria Section */}
      <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
            Task Description & Requirements
          </h2>
          {isCreator && !editingMeta && (
            <button
              onClick={() => setEditingMeta(true)}
              className="inline-flex items-center gap-1 text-xs font-bold border-2 border-black px-2.5 py-1 hover:bg-yellow-300 transition-colors"
            >
              <Edit3 size={12} /> {meta ? 'Edit Description' : 'Add Description'}
            </button>
          )}
        </div>

        {editingMeta ? (
          <div className="space-y-4 border-2 border-dashed border-black p-4 bg-yellow-50">
            <div>
              <label className="block text-xs font-bold mb-1">Description (Markdown / Text)</label>
              <textarea
                rows={5}
                value={metaForm.description}
                onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })}
                className="w-full border-2 border-black p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                placeholder="Describe the issue, repository URL, reproduction steps…"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Acceptance Criteria</label>
              <textarea
                rows={3}
                value={metaForm.acceptanceCriteria}
                onChange={(e) => setMetaForm({ ...metaForm, acceptanceCriteria: e.target.value })}
                className="w-full border-2 border-black p-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                placeholder="What counts as an acceptable pull request or fix?"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={metaForm.tags}
                onChange={(e) => setMetaForm({ ...metaForm, tags: e.target.value })}
                className="w-full border-2 border-black p-2 text-sm focus:outline-none"
                placeholder="react, typescript, ui"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { void handleSaveMetadata() }}
                disabled={savingMeta}
                className="border-2 border-black bg-black text-white px-4 py-1.5 text-xs font-bold hover:bg-yellow-300 hover:text-black transition-colors"
              >
                {savingMeta ? 'Saving…' : 'Save & Synchronize'}
              </button>
              <button
                onClick={() => setEditingMeta(false)}
                className="border-2 border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : meta ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{meta.description}</p>
            {meta.acceptanceCriteria && (
              <div className="bg-gray-50 border-2 border-gray-200 p-3.5 space-y-1">
                <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600">
                  Acceptance Criteria
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{meta.acceptanceCriteria}</p>
              </div>
            )}
            {meta.tags && meta.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {meta.tags.map((t) => (
                  <span key={t} className="px-2.5 py-0.5 text-xs font-medium border border-gray-300 bg-gray-100">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500 space-y-2">
            <p>No extended off-chain description was stored for this bounty.</p>
            {isCreator && (
              <button
                onClick={() => setEditingMeta(true)}
                className="border-2 border-black bg-black text-white px-3 py-1.5 text-xs font-bold hover:bg-yellow-300 hover:text-black transition-colors inline-block mt-1"
              >
                Add Description Now
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Zone: Funding / Submitting / Claiming / Refunding */}
      <NetworkGuard>
        <div className="space-y-4">
          {/* Fund unfunded open bounty */}
          {bounty.status === BountyStatus.Open && isCreator && (
            <div className="border-2 border-black bg-yellow-100 p-5 shadow-[4px_4px_0px_black] space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Info size={16} className="text-yellow-700" />
                <span>This bounty is registered onchain but not yet funded.</span>
              </div>
              <p className="text-xs text-gray-700">
                Deposit {bounty.rewardFormatted} USDC into escrow to activate submissions from contributors.
              </p>
              <button
                onClick={handleFundOpen}
                disabled={usdcApprovePending || fundPending || fundConfirming}
                className="border-2 border-black bg-black text-white px-5 py-2.5 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_black] disabled:opacity-50"
              >
                {usdcApprovePending
                  ? 'Approving USDC…'
                  : fundPending || fundConfirming
                  ? 'Funding Escrow…'
                  : `Fund with ${bounty.rewardFormatted} USDC`}
              </button>
            </div>
          )}

          {/* Submit Work Form */}
          {canSubmit && (
            <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black] space-y-4">
              {!showSubmitForm ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold text-base">Ready to fix this issue?</h3>
                    <p className="text-xs text-gray-500">
                      Submit your pull request link or work explanation to be considered for the reward.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (!user) {
                        toast.error('Please sign in with Google first.')
                        void signInWithGoogle()
                        return
                      }
                      setShowSubmitForm(true)
                    }}
                    className="border-2 border-black bg-black text-white px-5 py-2.5 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_#EAB308] shrink-0"
                  >
                    Submit Work
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-bold text-sm">Submit your solution</h3>
                    <button
                      onClick={() => setShowSubmitForm(false)}
                      className="text-xs font-bold underline"
                    >
                      Cancel
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      Solution Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Explain how you fixed the issue, test results, and implementation notes…"
                      value={submissionText}
                      onChange={(e) => setSubmissionText(e.target.value)}
                      className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      Links (PR, GitHub commit, Live demo — one per line)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="https://github.com/org/repo/pull/42&#10;https://demo.example.com"
                      value={submissionLinks}
                      onChange={(e) => setSubmissionLinks(e.target.value)}
                      className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSubmit}
                      disabled={submitPending || submitConfirming}
                      className="border-2 border-black bg-black text-white px-5 py-2.5 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_#EAB308] disabled:opacity-60"
                    >
                      {submitPending
                        ? 'Confirm in wallet…'
                        : submitConfirming
                        ? 'Submitting onchain…'
                        : 'Submit Solution'}
                    </button>
                    <button
                      onClick={() => setShowSubmitForm(false)}
                      className="border-2 border-black bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Claim Reward (Approved Contributor) */}
          {canClaim && (
            <div className="border-2 border-black bg-green-100 p-6 shadow-[6px_6px_0px_black] space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-green-700" />
                <h3 className="font-display font-bold text-lg text-green-900">
                  Congratulations! You were approved for this bounty.
                </h3>
              </div>
              <p className="text-xs text-green-800">
                You can now withdraw the escrowed {bounty.rewardFormatted} USDC directly to your connected wallet.
              </p>
              <button
                onClick={handleClaim}
                disabled={claimPending || claimConfirming}
                className="border-2 border-black bg-black text-white px-6 py-3 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[4px_4px_0px_#16a34a] disabled:opacity-60"
              >
                {claimPending ? 'Confirm in wallet…' : claimConfirming ? 'Claiming payout…' : `Claim ${bounty.rewardFormatted} USDC`}
              </button>
            </div>
          )}

          {/* Refund (Funded + Expired) */}
          {canRefund && (
            <div className="border-2 border-black bg-yellow-100 p-5 shadow-[4px_4px_0px_black] space-y-2">
              <h3 className="font-bold text-sm">Bounty deadline has passed without approval</h3>
              <p className="text-xs text-gray-700">
                As the creator, you can refund your escrowed {bounty.rewardFormatted} USDC back to your wallet.
              </p>
              <button
                onClick={handleRefund}
                disabled={refundPending || refundConfirming}
                className="border-2 border-black bg-black text-white px-5 py-2.5 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60"
              >
                {refundPending ? 'Confirm in wallet…' : refundConfirming ? 'Refunding…' : 'Refund Escrowed USDC'}
              </button>
            </div>
          )}

          {/* Refund After Approval (Grace period passed) */}
          {canRefundAfterApproval && graceExpired && (
            <div className="border-2 border-black bg-yellow-100 p-5 shadow-[4px_4px_0px_black] space-y-2">
              <h3 className="font-bold text-sm">Contributor claim window expired (7-day grace period)</h3>
              <p className="text-xs text-gray-700">
                The approved contributor did not claim the reward. You can now reclaim the escrowed USDC.
              </p>
              <button
                onClick={handleRefundAfterApproval}
                disabled={refundApprovalPending || refundApprovalConfirming}
                className="border-2 border-black bg-black text-white px-5 py-2.5 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60"
              >
                {refundApprovalPending ? 'Confirm in wallet…' : refundApprovalConfirming ? 'Recovering…' : 'Recover Escrow Funds'}
              </button>
            </div>
          )}

          {canRefundAfterApproval && !graceExpired && graceCutoff && (
            <div className="border-2 border-gray-300 bg-gray-50 p-3.5 text-xs text-gray-600">
              <ShieldCheck size={14} className="inline mr-1 text-gray-500" />
              Approved contributor has until {graceCutoff.toLocaleDateString()} to claim before creator refund becomes available.
            </div>
          )}
        </div>
      </NetworkGuard>

      {/* Submissions List Section */}
      <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-4">
        <h2 className="font-display font-bold text-lg flex items-center justify-between border-b pb-3">
          <span>Submissions ({submissions.length})</span>
          <span className="text-xs font-normal text-gray-500">
            {bounty.status === BountyStatus.Funded ? 'Reviewing' : 'Closed'}
          </span>
        </h2>

        {submissions.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-500 space-y-1">
            <p>No solutions submitted yet.</p>
            {bounty.status === BountyStatus.Funded && !bounty.isExpired && (
              <p>Be the first contributor to submit a fix!</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub, sIdx) => {
              const isThisApproved =
                bounty.approvedContributor.toLowerCase() === sub.contributorAddress.toLowerCase()

              return (
                <div
                  key={`${sub.contributorAddress}_${sIdx}`}
                  className={`border-2 p-4 transition-all ${
                    isThisApproved
                      ? 'border-green-600 bg-green-50 shadow-[3px_3px_0px_#16a34a]'
                      : 'border-black bg-white shadow-[2px_2px_0px_black]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5 mb-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <User size={14} />
                      <a
                        href={explorerAddr(sub.contributorAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-bold hover:underline"
                      >
                        {formatAddress(sub.contributorAddress)}
                      </a>
                      {sub.submittedAt && (
                        <span className="text-gray-400">
                          • {timeAgo(sub.submittedAt)}
                        </span>
                      )}
                    </div>

                    {isThisApproved ? (
                      <span className="text-xs font-bold bg-green-300 border border-black px-2 py-0.5">
                        ✓ Approved Contributor
                      </span>
                    ) : isCreator && canApprove ? (
                      <button
                        onClick={() => handleApproveContributor(sub.contributorAddress)}
                        disabled={approvePending || approveConfirming}
                        className="border-2 border-black bg-yellow-300 hover:bg-black hover:text-white px-3 py-1 text-xs font-bold transition-colors shadow-[1px_1px_0px_black]"
                      >
                        {approvePending ? 'Confirming…' : 'Approve for Payout'}
                      </button>
                    ) : null}
                  </div>

                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{sub.description}</p>

                  {sub.links && sub.links.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-100">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        Links
                      </span>
                      <div className="space-y-1">
                        {sub.links.map((link, lIdx) => (
                          <a
                            key={lIdx}
                            href={link.startsWith('http') ? link : `https://${link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all"
                          >
                            <ExternalLink size={11} /> {link}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

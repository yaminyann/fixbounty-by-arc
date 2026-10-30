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
  Tag,
  Target,
  FileCode,
  ListChecks,
  Send,
  HelpCircle,
  Check,
} from 'lucide-react'
import { useBounty } from '@/hooks/useBounty'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { NetworkGuard } from '@/components/ui/NetworkGuard'
import { ImageUpload } from '@/components/ui/ImageUpload'
import {
  BountyStatus,
  formatAddress,
  timeUntil,
  timeAgo,
  toSafeDate,
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

  // Submission Form State
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [submissionForm, setSubmissionForm] = useState({
    title: '',
    description: '',
    solutionDetails: '',
    pullRequestUrl: '',
    attachmentUrl: '',
  })

  // Creator metadata editing state
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaForm, setMetaForm] = useState({
    description: '',
    acceptanceCriteria: '',
    objectives: '',
    requirements: '',
    rules: '',
    eligibility: '',
    deliverables: '',
    submissionInstructions: '',
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
          objectives: apiBounty.objectives ?? undefined,
          requirements: apiBounty.requirements ?? undefined,
          rules: apiBounty.rules ?? undefined,
          eligibility: apiBounty.eligibility ?? undefined,
          deliverables: apiBounty.deliverables ?? undefined,
          submissionInstructions: apiBounty.submissionInstructions ?? undefined,
          tags: apiBounty.tags,
          links: apiBounty.links,
          categorySlug: apiBounty.categorySlug ?? undefined,
          imageUrl: apiBounty.imageUrl ?? undefined,
          moderationStatus: apiBounty.moderationStatus,
          moderationNote: apiBounty.moderationNote ?? undefined,
        })
        setMetaForm({
          description: apiBounty.description,
          acceptanceCriteria: apiBounty.acceptanceCriteria,
          objectives: apiBounty.objectives ?? '',
          requirements: apiBounty.requirements ?? '',
          rules: apiBounty.rules ?? '',
          eligibility: apiBounty.eligibility ?? '',
          deliverables: apiBounty.deliverables ?? '',
          submissionInstructions: apiBounty.submissionInstructions ?? '',
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
            objectives: m.objectives ?? '',
            requirements: m.requirements ?? '',
            rules: m.rules ?? '',
            eligibility: m.eligibility ?? '',
            deliverables: m.deliverables ?? '',
            submissionInstructions: m.submissionInstructions ?? '',
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
            title: s.title ?? undefined,
            description: s.description,
            solutionDetails: s.solutionDetails ?? undefined,
            links: s.attachments && s.attachments.length > 0 ? s.attachments : [s.pullRequestUrl],
            submittedAt: s.createdAt,
            status: s.status,
            seqNumber: s.seqNumber,
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
        objectives: metaForm.objectives || undefined,
        requirements: metaForm.requirements || undefined,
        rules: metaForm.rules || undefined,
        eligibility: metaForm.eligibility || undefined,
        deliverables: metaForm.deliverables || undefined,
        submissionInstructions: metaForm.submissionInstructions || undefined,
        tags: tagsArray,
      }).catch((e) => console.warn('[BountyDetail] PostgreSQL update error:', e))

      // 2. Persist to Firestore & local storage
      await saveBountyMeta(bountyId, {
        creatorUid: user?.uid ?? 'anonymous',
        creatorAddress: address?.toLowerCase() ?? bounty?.creator.toLowerCase(),
        description: metaForm.description,
        acceptanceCriteria: metaForm.acceptanceCriteria,
        objectives: metaForm.objectives || undefined,
        requirements: metaForm.requirements || undefined,
        rules: metaForm.rules || undefined,
        eligibility: metaForm.eligibility || undefined,
        deliverables: metaForm.deliverables || undefined,
        submissionInstructions: metaForm.submissionInstructions || undefined,
        tags: tagsArray,
      })

      setMeta({
        bountyId,
        creatorUid: user?.uid ?? 'anonymous',
        creatorAddress: address?.toLowerCase() ?? bounty?.creator.toLowerCase(),
        description: metaForm.description,
        acceptanceCriteria: metaForm.acceptanceCriteria,
        objectives: metaForm.objectives || undefined,
        requirements: metaForm.requirements || undefined,
        rules: metaForm.rules || undefined,
        eligibility: metaForm.eligibility || undefined,
        deliverables: metaForm.deliverables || undefined,
        submissionInstructions: metaForm.submissionInstructions || undefined,
        tags: tagsArray,
      })
      setEditingMeta(false)
      toast.success('Bounty details synchronized successfully!')
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
    if (!submissionForm.description.trim()) {
      toast.error('Please explain your solution description.')
      return
    }

    const payloadString = `${submissionForm.title || ''}:${submissionForm.description}`
    const contentHash = `sha256:${btoa(unescape(encodeURIComponent(payloadString))).slice(0, 32)}`

    submitWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'submitWork',
        args: [BigInt(bountyId), contentHash],
      },
      {
        onSuccess: (hash) => {
          toast.success('Work submitted onchain! Recording off-chain verification data…')
          setShowSubmitForm(false)

          void (async () => {
            const prUrl = submissionForm.pullRequestUrl.trim() || 'https://github.com'
            const atts: string[] = []
            if (submissionForm.attachmentUrl.trim()) atts.push(submissionForm.attachmentUrl.trim())

            // 1. Persist directly to PostgreSQL
            await apiCreateSubmission(bountyId, {
              submitterWallet: address.toLowerCase(),
              title: submissionForm.title.trim() || undefined,
              description: submissionForm.description,
              solutionDetails: submissionForm.solutionDetails.trim() || undefined,
              pullRequestUrl: prUrl,
              attachments: atts,
              txHash: hash,
            }).catch((e) => console.warn('[BountyDetail] PostgreSQL submission warning:', e))

            // 2. Persist to Firestore fallback
            void saveSubmissionMeta({
              bountyId,
              contributorUid: user.uid,
              contributorAddress: address.toLowerCase(),
              submissionHash: contentHash,
              title: submissionForm.title.trim() || undefined,
              description: submissionForm.description,
              solutionDetails: submissionForm.solutionDetails.trim() || undefined,
              links: [prUrl, ...atts],
            })

            // 3. Record in PostgreSQL activity table
            void apiRecordActivity({
              onchainId: bountyId,
              action: 'submitted',
              actorWallet: address,
              description: `Work submitted by ${formatAddress(address)}: ${submissionForm.title || 'Solution'}`,
              txHash: hash,
            })

            // Reset form
            setSubmissionForm({
              title: '',
              description: '',
              solutionDetails: '',
              pullRequestUrl: '',
              attachmentUrl: '',
            })
            void reloadOffChainData()
          })()
        },
        onError: (err) => toast.error(parseOnchainError(err)),
      }
    )
  }

  // Handle Creator Approval
  const handleApproveContributor = (contributorAddress: string) => {
    if (!checkChain()) return
    approveWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'approveBounty',
        args: [BigInt(bountyId), contributorAddress as `0x${string}`],
      },
      {
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
      }
    )
  }

  // Handle Contributor Claim
  const handleClaim = () => {
    if (!checkChain()) return
    claimWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'claimReward',
        args: [BigInt(bountyId)],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Reward claimed! ${bounty?.rewardFormatted} USDC transferred to your wallet.`)
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
      }
    )
  }

  // Handle Creator Refund
  const handleRefund = () => {
    if (!checkChain()) return
    refundWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'refundBounty',
        args: [BigInt(bountyId)],
      },
      {
        onSuccess: (hash) => {
          toast.success('Bounty refunded. Escrowed USDC returned to your wallet.')
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
      }
    )
  }

  // Handle Creator Refund after 7-day grace period
  const handleRefundAfterApproval = () => {
    if (!checkChain()) return
    refundApprovalWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'refundAfterApproval',
        args: [BigInt(bountyId)],
      },
      {
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
      }
    )
  }

  // Fund open bounty flow
  const handleFundOpen = () => {
    if (!bounty || !checkChain()) return
    usdcApproveWrite(
      {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [BOUNTY_BOARD_ADDRESS, bounty.reward],
      },
      {
        onSuccess: () => {
          toast.success('USDC approved! Now confirming escrow deposit…')
          fundWrite(
            {
              address: BOUNTY_BOARD_ADDRESS,
              abi: BOUNTY_BOARD_ABI,
              functionName: 'fundBounty',
              args: [BigInt(bountyId)],
            },
            {
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
            }
          )
        },
        onError: (err) => toast.error(parseOnchainError(err)),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 animate-pulse border-2 border-black" />
        <div className="h-64 bg-gray-100 animate-pulse border-2 border-black shadow-[4px_4px_0px_black]" />
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-4">
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
              <span className="text-xs font-mono font-black bg-yellow-300 px-2 py-0.5 border border-black shadow-[1px_1px_0px_black]">
                #{bounty.id}
              </span>
              <h1 className="font-display font-black text-xl sm:text-2xl tracking-tight">
                {bounty.title}
              </h1>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            void refetch()
            void reloadOffChainData()
            toast.info('Bounty state refreshed.')
          }}
          className="border-2 border-black p-2 bg-white hover:bg-yellow-300 transition-all shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          title="Refresh onchain state"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Cover Image if present */}
      {meta?.imageUrl && (
        <div className="border-2 border-black overflow-hidden bg-gray-100 max-h-96 flex items-center justify-center shadow-[6px_6px_0px_black]">
          <img
            src={meta.imageUrl}
            alt={bounty.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        </div>
      )}

      {/* Moderation Status Notice */}
      {meta?.moderationStatus === 'pending' && (
        <div className="border-2 border-black bg-yellow-200 p-4 shadow-[4px_4px_0px_black] flex items-center gap-3">
          <Clock size={20} className="shrink-0 text-black" />
          <div>
            <p className="font-bold text-sm">Under Quality Review</p>
            <p className="text-xs text-gray-800">
              This bounty is indexed and verified on Arc Testnet; platform quality moderators review submissions periodically.
            </p>
          </div>
        </div>
      )}

      {/* Key Financial & Contract Metrics Card */}
      <div className="border-2 border-black bg-white shadow-[6px_6px_0px_black] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-gray-100 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={bounty.status} />
            {meta?.categorySlug && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold bg-yellow-300 border border-black uppercase tracking-wider shadow-[1px_1px_0px_black]">
                <Tag size={11} />
                {meta.categorySlug.replace('-', ' ')}
              </span>
            )}
            <span className="text-xl font-black text-black flex items-center gap-1 tabular-nums">
              <DollarSign size={20} strokeWidth={2.5} />
              {bounty.rewardFormatted} USDC
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-600 font-mono">
            <Clock size={14} />
            <span>{bounty.isExpired ? 'Expired' : `${timeUntil(bounty.deadline)} remaining`}</span>
          </div>
        </div>

        {/* Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Creator Wallet</span>
            <div className="flex items-center gap-1.5 mt-1">
              <a
                href={explorerAddr(bounty.creator)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs hover:underline flex items-center gap-1 text-black font-bold"
              >
                {formatAddress(bounty.creator)} <ExternalLink size={11} />
              </a>
              {isCreator && (
                <span className="bg-yellow-300 border border-black text-[10px] font-bold px-1.5 py-0.2">
                  You
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Deadline</span>
            <p className="mt-1 font-medium text-gray-900 font-mono">
              {bounty.deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Escrow Contract</span>
            <div className="flex items-center gap-1.5 mt-1">
              <a
                href={explorerAddr(BOUNTY_BOARD_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs hover:underline flex items-center gap-1 text-gray-700"
              >
                {formatAddress(BOUNTY_BOARD_ADDRESS)} <ExternalLink size={10} />
              </a>
            </div>
          </div>

          {bounty.approvedContributor !== '0x0000000000000000000000000000000000000000' && (
            <div className="sm:col-span-2 md:col-span-3 pt-2 border-t border-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Approved Contributor
              </span>
              <div className="flex items-center gap-2 mt-1">
                <a
                  href={explorerAddr(bounty.approvedContributor)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm hover:underline flex items-center gap-1 text-green-700 font-bold"
                >
                  {formatAddress(bounty.approvedContributor)} <ExternalLink size={12} />
                </a>
                {isApproved && (
                  <span className="bg-green-300 border border-black text-[10px] font-bold px-2 py-0.5">
                    Your Wallet
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Structured Details Sections */}
      <div className="border-2 border-black bg-white p-6 shadow-[6px_6px_0px_black] space-y-6">
        <div className="flex items-center justify-between border-b-2 border-black pb-3">
          <div className="flex items-center gap-2">
            <FileCode size={20} />
            <h2 className="font-display font-bold text-lg">Specifications & Requirements</h2>
          </div>
          {isCreator && !editingMeta && (
            <button
              onClick={() => setEditingMeta(true)}
              className="inline-flex items-center gap-1 text-xs font-bold border-2 border-black px-3 py-1 bg-yellow-300 hover:bg-yellow-400 transition-colors shadow-[1px_1px_0px_black]"
            >
              <Edit3 size={12} /> Edit Details
            </button>
          )}
        </div>

        {editingMeta ? (
          <div className="space-y-4 border-2 border-black p-5 bg-yellow-50">
            <h3 className="font-bold text-sm">Update Off-Chain Metadata</h3>

            <div>
              <label className="block text-xs font-bold uppercase mb-1">Description</label>
              <textarea
                rows={4}
                value={metaForm.description}
                onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })}
                className="w-full border-2 border-black p-2 text-xs font-mono focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Objectives</label>
                <textarea
                  rows={3}
                  value={metaForm.objectives}
                  onChange={(e) => setMetaForm({ ...metaForm, objectives: e.target.value })}
                  className="w-full border-2 border-black p-2 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Technical Requirements</label>
                <textarea
                  rows={3}
                  value={metaForm.requirements}
                  onChange={(e) => setMetaForm({ ...metaForm, requirements: e.target.value })}
                  className="w-full border-2 border-black p-2 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Contribution Rules</label>
                <textarea
                  rows={3}
                  value={metaForm.rules}
                  onChange={(e) => setMetaForm({ ...metaForm, rules: e.target.value })}
                  className="w-full border-2 border-black p-2 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Eligibility</label>
                <textarea
                  rows={3}
                  value={metaForm.eligibility}
                  onChange={(e) => setMetaForm({ ...metaForm, eligibility: e.target.value })}
                  className="w-full border-2 border-black p-2 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Deliverables</label>
                <textarea
                  rows={2}
                  value={metaForm.deliverables}
                  onChange={(e) => setMetaForm({ ...metaForm, deliverables: e.target.value })}
                  className="w-full border-2 border-black p-2 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Submission Instructions</label>
                <textarea
                  rows={2}
                  value={metaForm.submissionInstructions}
                  onChange={(e) => setMetaForm({ ...metaForm, submissionInstructions: e.target.value })}
                  className="w-full border-2 border-black p-2 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase mb-1">Acceptance Criteria</label>
              <textarea
                rows={2}
                value={metaForm.acceptanceCriteria}
                onChange={(e) => setMetaForm({ ...metaForm, acceptanceCriteria: e.target.value })}
                className="w-full border-2 border-black p-2 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase mb-1">Tags (Comma-separated)</label>
              <input
                type="text"
                value={metaForm.tags}
                onChange={(e) => setMetaForm({ ...metaForm, tags: e.target.value })}
                className="w-full border-2 border-black p-2 text-xs focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { void handleSaveMetadata() }}
                disabled={savingMeta}
                className="border-2 border-black bg-black text-white px-4 py-2 text-xs font-bold hover:bg-yellow-300 hover:text-black shadow-[2px_2px_0px_black]"
              >
                {savingMeta ? 'Saving Changes…' : 'Save & Sync Metadata'}
              </button>
              <button
                type="button"
                onClick={() => setEditingMeta(false)}
                className="border-2 border-black bg-white px-3 py-2 text-xs font-bold hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main Description */}
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Description</h3>
              <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 p-4 border border-black">
                {meta?.description || 'No description provided.'}
              </p>
            </div>

            {/* Objectives & Deliverables Grid */}
            {(meta?.objectives || meta?.deliverables || meta?.requirements) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {meta.objectives && (
                  <div className="border-2 border-black p-4 bg-white shadow-[2px_2px_0px_black] space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Target size={14} className="text-yellow-600" />
                      Objectives
                    </span>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{meta.objectives}</p>
                  </div>
                )}
                {meta.requirements && (
                  <div className="border-2 border-black p-4 bg-white shadow-[2px_2px_0px_black] space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                      <ListChecks size={14} className="text-blue-600" />
                      Requirements
                    </span>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{meta.requirements}</p>
                  </div>
                )}
                {meta.deliverables && (
                  <div className="border-2 border-black p-4 bg-white shadow-[2px_2px_0px_black] space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                      <FileCode size={14} className="text-green-600" />
                      Deliverables
                    </span>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{meta.deliverables}</p>
                  </div>
                )}
              </div>
            )}

            {/* Rules & Eligibility */}
            {(meta?.rules || meta?.eligibility || meta?.submissionInstructions) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {meta.rules && (
                  <div className="border-2 border-black p-4 bg-white shadow-[2px_2px_0px_black] space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-yellow-600" />
                      Contribution Rules
                    </span>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{meta.rules}</p>
                  </div>
                )}
                {meta.eligibility && (
                  <div className="border-2 border-black p-4 bg-white shadow-[2px_2px_0px_black] space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                      <User size={14} className="text-purple-600" />
                      Eligibility
                    </span>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{meta.eligibility}</p>
                  </div>
                )}
                {meta.submissionInstructions && (
                  <div className="border-2 border-black p-4 bg-white shadow-[2px_2px_0px_black] space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Send size={14} className="text-indigo-600" />
                      Instructions
                    </span>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{meta.submissionInstructions}</p>
                  </div>
                )}
              </div>
            )}

            {/* Acceptance Criteria */}
            {meta?.acceptanceCriteria && (
              <div className="border-2 border-black p-4 bg-yellow-50 shadow-[3px_3px_0px_black] space-y-2">
                <span className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-green-700" />
                  Acceptance Criteria for Escrow Release
                </span>
                <p className="text-xs text-gray-900 leading-relaxed whitespace-pre-wrap font-medium">
                  {meta.acceptanceCriteria}
                </p>
              </div>
            )}

            {/* Tags */}
            {meta?.tags && meta.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {meta.tags.map((t) => (
                  <span key={t} className="px-2.5 py-0.5 text-xs font-mono border border-black bg-gray-100 shadow-[1px_1px_0px_black]">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Zone: Funding / Submitting / Claiming / Refunding */}
      <NetworkGuard>
        <div className="space-y-4">
          {/* Fund unfunded open bounty */}
          {bounty.status === BountyStatus.Open && isCreator && (
            <div className="border-2 border-black bg-yellow-100 p-6 shadow-[4px_4px_0px_black] space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Info size={16} className="text-yellow-700" />
                <span>Bounty Registered Onchain (Awaiting Escrow Deposit)</span>
              </div>
              <p className="text-xs text-gray-800 leading-relaxed">
                Deposit {bounty.rewardFormatted} USDC into escrow to activate the bounty for contributors.
              </p>
              <button
                onClick={handleFundOpen}
                disabled={usdcApprovePending || fundPending || fundConfirming}
                className="border-2 border-black bg-black text-white px-5 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_black] disabled:opacity-50"
              >
                {usdcApprovePending
                  ? 'Approving USDC…'
                  : fundPending || fundConfirming
                  ? 'Funding Escrow…'
                  : `Deposit ${bounty.rewardFormatted} USDC Escrow`}
              </button>
            </div>
          )}

          {/* Submit Work Form */}
          {canSubmit && (
            <div className="border-2 border-black bg-white p-6 shadow-[6px_6px_0px_black] space-y-4">
              {!showSubmitForm ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display font-black text-lg">Ready to solve this bounty?</h3>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Submit your pull request, reproduction notes, or proof of fix to claim the{' '}
                      <strong>{bounty.rewardFormatted} USDC</strong> escrow.
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
                    className="border-2 border-black bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-wider hover:bg-black hover:text-white transition-all shadow-[3px_3px_0px_black] shrink-0 active:translate-x-0.5 active:translate-y-0.5"
                  >
                    Submit Work
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-black pb-2.5">
                    <h3 className="font-display font-bold text-base">Submit Solution</h3>
                    <button
                      onClick={() => setShowSubmitForm(false)}
                      className="text-xs font-bold underline hover:text-red-600"
                    >
                      Cancel
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      Solution Title <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Patch reentrancy vulnerability and add 5 fuzz tests"
                      value={submissionForm.title}
                      onChange={(e) => setSubmissionForm({ ...submissionForm, title: e.target.value })}
                      className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      Solution Summary <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Overview of the changes made to solve this bounty…"
                      value={submissionForm.description}
                      onChange={(e) => setSubmissionForm({ ...submissionForm, description: e.target.value })}
                      className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      Technical Solution Details & Verification Steps
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Implementation notes, test commands run, environment setup…"
                      value={submissionForm.solutionDetails}
                      onChange={(e) => setSubmissionForm({ ...submissionForm, solutionDetails: e.target.value })}
                      className="w-full border-2 border-black px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      Pull Request / Demo URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://github.com/org/repo/pull/42"
                      value={submissionForm.pullRequestUrl}
                      onChange={(e) => setSubmissionForm({ ...submissionForm, pullRequestUrl: e.target.value })}
                      className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 font-mono"
                    />
                  </div>

                  {/* Optional Image / Test Screenshot Upload */}
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      Proof / Test Screenshot (Optional)
                    </label>
                    <ImageUpload
                      value={submissionForm.attachmentUrl}
                      onChange={(url) => setSubmissionForm({ ...submissionForm, attachmentUrl: url })}
                      alt="Solution proof screenshot"
                      aspectRatio="16/9"
                      helpText="Attach a screenshot of passing test suites, gas benchmarks, or terminal proof."
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleSubmit}
                      disabled={submitPending || submitConfirming}
                      className="border-2 border-black bg-black text-white px-6 py-3 text-xs font-bold uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all shadow-[3px_3px_0px_#EAB308] disabled:opacity-60"
                    >
                      {submitPending
                        ? 'Confirm in Wallet…'
                        : submitConfirming
                        ? 'Submitting Onchain…'
                        : 'Sign & Submit Work'}
                    </button>
                    <button
                      onClick={() => setShowSubmitForm(false)}
                      className="border-2 border-black bg-white px-4 py-3 text-xs font-bold hover:bg-gray-100"
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
                <CheckCircle2 size={24} className="text-green-700" />
                <h3 className="font-display font-black text-xl text-green-950">
                  Approved! Claim Your Reward
                </h3>
              </div>
              <p className="text-xs text-green-900 leading-relaxed">
                The bounty creator has verified and approved your solution. You can withdraw the locked{' '}
                <strong>{bounty.rewardFormatted} USDC</strong> directly to your wallet now.
              </p>
              <button
                onClick={handleClaim}
                disabled={claimPending || claimConfirming}
                className="border-2 border-black bg-black text-white px-6 py-3 font-bold text-xs uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all shadow-[4px_4px_0px_#16a34a] disabled:opacity-60"
              >
                {claimPending ? 'Confirm in Wallet…' : claimConfirming ? 'Claiming USDC…' : `Claim ${bounty.rewardFormatted} USDC`}
              </button>
            </div>
          )}

          {/* Refund (Funded + Expired) */}
          {canRefund && (
            <div className="border-2 border-black bg-yellow-100 p-5 shadow-[4px_4px_0px_black] space-y-2">
              <h3 className="font-bold text-sm">Bounty Deadline Expired</h3>
              <p className="text-xs text-gray-700">
                The deadline has passed without an approved submission. Reclaim your full {bounty.rewardFormatted} USDC escrow.
              </p>
              <button
                onClick={handleRefund}
                disabled={refundPending || refundConfirming}
                className="border-2 border-black bg-black text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60"
              >
                {refundPending ? 'Confirm in Wallet…' : refundConfirming ? 'Refunding…' : 'Refund Escrowed USDC'}
              </button>
            </div>
          )}

          {/* Refund After Approval (Grace period passed) */}
          {canRefundAfterApproval && graceExpired && (
            <div className="border-2 border-black bg-yellow-100 p-5 shadow-[4px_4px_0px_black] space-y-2">
              <h3 className="font-bold text-sm">Claim Window Elapsed (7-Day Grace Period)</h3>
              <p className="text-xs text-gray-700">
                The approved contributor did not claim the payout within the 7-day safety period. You may now reclaim the USDC.
              </p>
              <button
                onClick={handleRefundAfterApproval}
                disabled={refundApprovalPending || refundApprovalConfirming}
                className="border-2 border-black bg-black text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60"
              >
                {refundApprovalPending ? 'Confirm in Wallet…' : refundApprovalConfirming ? 'Recovering…' : 'Recover Escrow Funds'}
              </button>
            </div>
          )}

          {canRefundAfterApproval && !graceExpired && graceCutoff && (
            <div className="border-2 border-gray-300 bg-gray-50 p-3.5 text-xs text-gray-600 font-mono">
              <ShieldCheck size={14} className="inline mr-1 text-gray-500" />
              Contributor has until {graceCutoff.toLocaleDateString()} to claim before creator refund becomes available.
            </div>
          )}
        </div>
      </NetworkGuard>

      {/* Submissions List Section */}
      <div className="border-2 border-black bg-white p-6 shadow-[6px_6px_0px_black] space-y-4">
        <h2 className="font-display font-bold text-lg flex items-center justify-between border-b-2 border-black pb-3">
          <span>Submissions ({submissions.length})</span>
          <span className="text-xs font-mono font-normal text-gray-500">
            {bounty.status === BountyStatus.Funded ? 'Status: Accepting Submissions' : 'Status: Concluded'}
          </span>
        </h2>

        {submissions.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-500 space-y-2">
            <p className="font-bold text-gray-700 text-sm">No solutions submitted yet.</p>
            {bounty.status === BountyStatus.Funded && !bounty.isExpired && (
              <p>Be the first developer to submit a pull request and claim the reward.</p>
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
                  className={`border-2 p-5 transition-all ${
                    isThisApproved
                      ? 'border-green-600 bg-green-50 shadow-[4px_4px_0px_#16a34a]'
                      : 'border-black bg-white shadow-[3px_3px_0px_black]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-3 mb-3">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="font-mono font-black bg-black text-white px-2 py-0.5 text-xs shadow-[1px_1px_0px_#EAB308]">
                        #{sub.seqNumber ?? sIdx + 1}
                      </span>
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
                        <span className="text-gray-500 font-mono text-[11px]">
                          • {timeAgo(sub.submittedAt)}
                        </span>
                      )}
                      {sub.status && sub.status !== 'pending' && (
                        <span
                          className={`px-1.5 py-0.2 text-[10px] font-bold border ${
                            sub.status === 'approved'
                              ? 'bg-green-100 text-green-800 border-green-600'
                              : 'bg-red-100 text-red-800 border-red-600'
                          }`}
                        >
                          {sub.status.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {isThisApproved ? (
                      <span className="text-xs font-black bg-green-300 border-2 border-black px-2.5 py-0.5 shadow-[1px_1px_0px_black]">
                        ✓ Approved Solution
                      </span>
                    ) : isCreator && canApprove ? (
                      <button
                        onClick={() => handleApproveContributor(sub.contributorAddress)}
                        disabled={approvePending || approveConfirming}
                        className="border-2 border-black bg-yellow-300 hover:bg-black hover:text-white px-3.5 py-1 text-xs font-black uppercase tracking-wider transition-all shadow-[2px_2px_0px_black]"
                      >
                        {approvePending ? 'Confirming…' : 'Approve for Payout'}
                      </button>
                    ) : null}
                  </div>

                  {sub.title && (
                    <h4 className="font-display font-bold text-base mb-1.5 text-black">
                      {sub.title}
                    </h4>
                  )}

                  <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {sub.description}
                  </p>

                  {sub.solutionDetails && (
                    <div className="mt-3 p-3 bg-gray-50 border border-black font-mono text-xs text-gray-800 whitespace-pre-wrap">
                      <div className="font-bold uppercase tracking-wider text-[10px] text-gray-500 mb-1">
                        Technical Details / Test Results:
                      </div>
                      {sub.solutionDetails}
                    </div>
                  )}

                  {sub.links && sub.links.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                        Attached Links & Proof
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {sub.links.map((link, lIdx) => {
                          const isImg = link.startsWith('/api/media/') || /\.(png|jpg|jpeg|webp)$/i.test(link)
                          if (isImg) {
                            return (
                              <div key={lIdx} className="border border-black overflow-hidden max-h-40 bg-gray-100">
                                <a href={link} target="_blank" rel="noopener noreferrer">
                                  <img src={link} alt="Attachment" className="max-h-40 object-cover hover:opacity-90" />
                                </a>
                              </div>
                            )
                          }
                          return (
                            <a
                              key={lIdx}
                              href={link.startsWith('http') ? link : `https://${link}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all font-mono border border-gray-300 px-2 py-0.5 bg-gray-50"
                            >
                              <ExternalLink size={11} /> {link}
                            </a>
                          )
                        })}
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

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, parseEventLogs } from 'viem'
import { toast } from 'sonner'
import {
  Info,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Tag,
  DollarSign,
  Clock,
  Layers,
  FileText,
  ShieldAlert,
  Sparkles,
  Eye,
  Check,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  BOUNTY_BOARD_ADDRESS,
  BOUNTY_BOARD_ABI,
  USDC_ADDRESS,
  USDC_DECIMALS,
  TARGET_CHAIN_ID,
  explorerTx,
} from '@/lib/contract'
import { parseAmount } from '@/onchain-money'
import { parseOnchainError } from '@/lib/bountyTypes'
import { saveBountyMeta, logActivity } from '@/lib/firestore'
import { apiSaveBounty, apiSyncBountyOnchain, apiGetCategories, type ApiCategory } from '@/lib/api'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { NetworkGuard } from '@/components/ui/NetworkGuard'
import { ConnectKitButton } from 'connectkit'

type Step = 'create' | 'approve' | 'fund' | 'done'

const DEFAULT_CATEGORIES: ApiCategory[] = [
  { id: 1, slug: 'bug-fix', name: 'Bug Fix', description: 'Resolve bugs and unexpected issues', color: '#EF4444' },
  { id: 2, slug: 'feature', name: 'Feature Request', description: 'Add new capabilities or endpoints', color: '#3B82F6' },
  { id: 3, slug: 'documentation', name: 'Documentation', description: 'Improve guides, README, or API docs', color: '#10B981' },
  { id: 4, slug: 'security', name: 'Security Audit & Fix', description: 'Vulnerability patching and security hardening', color: '#F59E0B' },
  { id: 5, slug: 'performance', name: 'Performance Optimization', description: 'Speed up queries, rendering, or gas', color: '#8B5CF6' },
  { id: 6, slug: 'testing', name: 'Test Suite & Coverage', description: 'Unit, fuzz, or invariant tests', color: '#06B6D4' },
  { id: 7, slug: 'design', name: 'Design & UI/UX', description: 'Interface refinement and visual design', color: '#EC4899' },
  { id: 8, slug: 'other', name: 'Other', description: 'General open-source contribution', color: '#6B7280' },
]

const POPULAR_TAGS = ['typescript', 'react', 'solidity', 'security', 'bug', 'smart-contract', 'backend', 'api', 'ui']

export function CreateBounty() {
  const navigate = useNavigate()
  const { user, signInWithGoogle } = useAuth()
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [categories, setCategories] = useState<ApiCategory[]>(DEFAULT_CATEGORIES)
  const [form, setForm] = useState({
    title: '',
    categorySlug: 'bug-fix',
    imageUrl: '',
    tags: '',
    // Detailed structured fields
    description: '',
    objectives: '',
    requirements: '',
    deliverables: '',
    rules: '',
    eligibility: '',
    submissionInstructions: '',
    acceptanceCriteria: '',
    // Financials & Deadline
    rewardRaw: '',
    deadlineDays: '14',
  })

  const [step, setStep] = useState<Step>('create')
  const [pendingBountyId, setPendingBountyId] = useState<number | null>(null)
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  // Load backend categories on mount
  useEffect(() => {
    apiGetCategories()
      .then((cats) => {
        if (cats && cats.length > 0) setCategories(cats)
      })
      .catch(() => {})
  }, [])

  // Step 1: createBounty
  const { writeContract: createWrite, data: createHash, isPending: createPending } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createHash })

  // Step 2: approve USDC
  const { writeContract: approveWrite, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  // Step 3: fundBounty
  const { writeContract: fundWrite, data: fundHash, isPending: fundPending } = useWriteContract()
  const { isLoading: fundConfirming, isSuccess: fundSuccess } = useWaitForTransactionReceipt({ hash: fundHash })

  const parsedReward = (() => {
    try {
      return parseAmount(TARGET_CHAIN_ID, form.rewardRaw)
    } catch {
      return null
    }
  })()

  const deadlineTs = Math.floor(Date.now() / 1000) + Number(form.deadlineDays) * 86400

  // Tag click helper
  const handleToggleTag = (tag: string) => {
    const existing = form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    if (existing.includes(tag)) {
      setForm({ ...form, tags: existing.filter((t) => t !== tag).join(', ') })
    } else {
      setForm({ ...form, tags: [...existing, tag].join(', ') })
    }
  }

  // --- Step 1: Create onchain ---
  const handleCreate = () => {
    if (!user) {
      toast.error('Please sign in with Google first.')
      return
    }
    if (!isConnected) {
      toast.error('Connect your wallet first.')
      return
    }
    if (chainId !== TARGET_CHAIN_ID) {
      switchChain({ chainId: TARGET_CHAIN_ID })
      return
    }
    if (!form.title.trim()) {
      toast.error('Bounty title is required.')
      return
    }
    if (!form.description.trim()) {
      toast.error('Description is required.')
      return
    }
    if (!form.acceptanceCriteria.trim()) {
      toast.error('Acceptance criteria is required.')
      return
    }
    if (!parsedReward || parsedReward.raw <= 0n) {
      toast.error('Enter a valid USDC reward amount.')
      return
    }
    if (Number(form.deadlineDays) < 1) {
      toast.error('Deadline must be at least 1 day.')
      return
    }

    // Generate contentHash of description
    const contentHash = `sha256:${btoa(unescape(encodeURIComponent(form.description))).slice(0, 32)}`

    createWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'createBounty',
        args: [form.title.trim(), contentHash, parsedReward.raw, BigInt(deadlineTs)],
      },
      {
        onSuccess: () => {
          toast.success('Bounty registered onchain! Now approve USDC spending…')
          setStep('approve')
        },
        onError: (err) => toast.error(parseOnchainError(err)),
      }
    )
  }

  // Persist metadata to PostgreSQL and Firestore
  const persistMetadata = async (id: number) => {
    setMetaSaveStatus('saving')
    try {
      const tagsList = form.tags.split(',').map((t) => t.trim()).filter(Boolean)

      // 1. Persist directly to PostgreSQL backend
      await apiSaveBounty({
        onchainId: id,
        creatorWallet: address?.toLowerCase() || '',
        title: form.title.trim(),
        description: form.description,
        acceptanceCriteria: form.acceptanceCriteria,
        objectives: form.objectives.trim() || undefined,
        requirements: form.requirements.trim() || undefined,
        rules: form.rules.trim() || undefined,
        eligibility: form.eligibility.trim() || undefined,
        deliverables: form.deliverables.trim() || undefined,
        submissionInstructions: form.submissionInstructions.trim() || undefined,
        rewardAmount: parsedReward ? parsedReward.raw.toString() : '0',
        deadline: new Date(deadlineTs * 1000).toISOString(),
        tags: tagsList,
        links: [],
        categorySlug: form.categorySlug,
        imageUrl: form.imageUrl.trim() || undefined,
        txHash: createHash,
      }).catch((e) => console.warn('[CreateBounty] PostgreSQL save warning:', e))

      // Trigger immediate onchain sync in backend
      void apiSyncBountyOnchain(id)

      // 2. Persist to Firestore fallback
      await saveBountyMeta(id, {
        creatorUid: user?.uid ?? 'anonymous',
        creatorAddress: address?.toLowerCase(),
        description: form.description,
        acceptanceCriteria: form.acceptanceCriteria,
        objectives: form.objectives.trim() || undefined,
        requirements: form.requirements.trim() || undefined,
        rules: form.rules.trim() || undefined,
        eligibility: form.eligibility.trim() || undefined,
        deliverables: form.deliverables.trim() || undefined,
        submissionInstructions: form.submissionInstructions.trim() || undefined,
        tags: tagsList,
        categorySlug: form.categorySlug,
        imageUrl: form.imageUrl.trim() || undefined,
      })

      if (address) {
        await logActivity({
          bountyId: id,
          type: 'created',
          actorAddress: address,
          txHash: createHash,
          message: `Bounty #${id} "${form.title}" created with ${form.rewardRaw} USDC reward`,
        }).catch(() => {})
      }
      setMetaSaveStatus('saved')
    } catch (err) {
      console.error('[CreateBounty] Failed to save metadata:', err)
      setMetaSaveStatus('failed')
    }
  }

  // Extract bountyId from create receipt
  useEffect(() => {
    if (!createSuccess || !createReceipt || pendingBountyId !== null) return

    let id: number | null = null
    try {
      const parsedLogs = parseEventLogs({
        abi: BOUNTY_BOARD_ABI,
        eventName: 'BountyCreated',
        logs: createReceipt.logs,
      })
      if (parsedLogs.length > 0 && parsedLogs[0].args.bountyId) {
        id = Number(parsedLogs[0].args.bountyId)
      }
    } catch {
      const firstLog = createReceipt.logs?.[0]
      if (firstLog?.topics?.[1]) {
        id = Number(BigInt(firstLog.topics[1]))
      }
    }

    if (id && id > 0) {
      setPendingBountyId(id)
      void persistMetadata(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSuccess, createReceipt])

  // Step 2: Approve USDC
  const handleApprove = () => {
    if (!parsedReward) return
    approveWrite(
      {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [BOUNTY_BOARD_ADDRESS, parsedReward.raw],
      },
      {
        onSuccess: () => toast.success('USDC approved! Now proceed to lock escrow…'),
        onError: (err) => toast.error(parseOnchainError(err)),
      }
    )
  }

  useEffect(() => {
    if (approveSuccess) setStep('fund')
  }, [approveSuccess])

  // Step 3: Fund bounty
  const handleFund = () => {
    if (pendingBountyId === null) {
      toast.error('Bounty ID not confirmed yet. Please wait for onchain receipt.')
      return
    }
    fundWrite(
      {
        address: BOUNTY_BOARD_ADDRESS,
        abi: BOUNTY_BOARD_ABI,
        functionName: 'fundBounty',
        args: [BigInt(pendingBountyId)],
      },
      {
        onSuccess: (hash) => {
          toast.success('Bounty funded! Directing to details…')
          setStep('done')
          if (pendingBountyId) {
            void apiSyncBountyOnchain(pendingBountyId)
            void persistMetadata(pendingBountyId)
          }
          if (address) {
            void logActivity({
              bountyId: pendingBountyId,
              type: 'funded',
              actorAddress: address,
              txHash: hash,
              message: `Bounty #${pendingBountyId} funded with ${form.rewardRaw} USDC`,
            }).catch(() => {})
          }
        },
        onError: (err) => toast.error(parseOnchainError(err)),
      }
    )
  }

  useEffect(() => {
    if (fundSuccess && step !== 'done') {
      if (pendingBountyId) {
        void apiSyncBountyOnchain(pendingBountyId)
        void persistMetadata(pendingBountyId)
      }
      setTimeout(() => {
        void navigate(pendingBountyId ? `/bounty/${pendingBountyId}` : '/explore')
      }, 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundSuccess])

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const selectedCategoryObj = categories.find((c) => c.slug === form.categorySlug)

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="border-b-2 border-black pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-black uppercase tracking-wider bg-yellow-300 border border-black shadow-[1px_1px_0px_black]">
              Escrow Setup
            </span>
            <span className="text-xs text-gray-500 font-mono">Arc Testnet Smart Contracts</span>
          </div>
          <h1 className="font-display font-black text-3xl tracking-tight">Create & Fund Bounty</h1>
          <p className="text-sm text-gray-600 mt-1">
            Specify technical deliverables, define clear acceptance rules, and lock USDC reward directly into contract escrow.
          </p>
        </div>

        {/* Action Button to Preview */}
        <button
          type="button"
          onClick={() => setShowPreviewModal(!showPreviewModal)}
          className="inline-flex items-center gap-1.5 px-4 py-2 border-2 border-black bg-white hover:bg-yellow-200 font-bold text-xs uppercase tracking-wider shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5 transition-all self-start md:self-auto"
        >
          <Eye size={14} />
          {showPreviewModal ? 'Hide Card Preview' : 'Preview Card'}
        </button>
      </div>

      {/* Auth & Wallet Requirement Gates */}
      {!user && (
        <div className="border-2 border-black bg-yellow-50 p-5 shadow-[4px_4px_0px_black] space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Info size={18} className="text-yellow-700" />
            <span>Google Authentication Required</span>
          </div>
          <p className="text-sm text-gray-700">
            Sign in with Google to link your off-chain bounty details and review contributor submissions in your dashboard.
          </p>
          <button
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 border-2 border-black bg-black text-white px-5 py-2.5 font-bold text-xs uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_black]"
          >
            Sign In with Google
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black] space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Info size={18} className="text-blue-600" />
            <span>Connect Web3 Wallet</span>
          </div>
          <p className="text-sm text-gray-600">
            Connect an Arc Testnet compatible wallet to deploy the bounty and fund escrow with testnet USDC.
          </p>
          <ConnectKitButton />
        </div>
      )}

      {isWrongChain && (
        <div className="mb-4">
          <NetworkGuard>
            <span />
          </NetworkGuard>
        </div>
      )}

      {/* Step Indicator */}
      <div className="grid grid-cols-3 gap-2 border-2 border-black p-2 bg-white shadow-[3px_3px_0px_black]">
        {[
          { key: 'create', num: 1, label: '1. Register Onchain' },
          { key: 'approve', num: 2, label: '2. Approve USDC' },
          { key: 'fund', num: 3, label: '3. Lock Escrow' },
        ].map((s) => {
          const isActive = step === s.key
          const isDone =
            (step === 'approve' && s.num === 1) ||
            (step === 'fund' && s.num <= 2) ||
            step === 'done'

          return (
            <div
              key={s.key}
              className={`p-2.5 text-center font-bold text-xs uppercase tracking-wider border-2 border-black transition-all ${
                isActive
                  ? 'bg-yellow-300 shadow-[2px_2px_0px_black]'
                  : isDone
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-400 border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                {isDone && <Check size={14} className="text-yellow-400" />}
                <span>{s.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Step 1: Form & Live Preview Grid */}
      {step === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Form (8 cols on desktop) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Section 1: Basic Information & Visuals */}
            <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-5">
              <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                <Layers size={18} />
                <h2 className="font-display font-bold text-lg">1. Basic Information & Visuals</h2>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                  Bounty Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Patch reentrancy edge case in settlement vault"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 font-medium"
                />
                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                  <span>Concise summary of the task or bug</span>
                  <span>{form.title.length}/120</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Tag size={14} />
                    <span>Category</span> <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.categorySlug}
                    onChange={(e) => setForm({ ...form, categorySlug: e.target.value })}
                    className="w-full border-2 border-black px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-300 font-medium cursor-pointer"
                  >
                    {categories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selectedCategoryObj?.description || 'Select task category'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    Tags (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="typescript, react, audit"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 font-medium"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {POPULAR_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`text-[10px] px-1.5 py-0.5 border border-black font-mono transition-colors ${
                          form.tags.includes(tag) ? 'bg-yellow-300 font-bold' : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cover Image Upload Component */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                  Bounty Cover Image (Optimized & Stored in Database)
                </label>
                <ImageUpload
                  value={form.imageUrl}
                  onChange={(url) => setForm({ ...form, imageUrl: url })}
                  alt="Bounty Cover"
                  aspectRatio="16/9"
                  helpText="Upload a banner or architecture diagram (PNG, JPEG, WebP). It is automatically downsampled, compressed to WebP, and stored in PostgreSQL."
                />
              </div>
            </div>

            {/* Section 2: Task Scope & Objectives */}
            <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-5">
              <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                <FileText size={18} />
                <h2 className="font-display font-bold text-lg">2. Task Scope & Objectives</h2>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                  Detailed Description <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-1.5">
                  Explain the problem, repository, affected functions, or reproduction steps.
                </p>
                <textarea
                  rows={5}
                  placeholder="Provide full context on what needs to be fixed or built…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    Objectives
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Key milestones or target outcomes for this bounty…"
                    value={form.objectives}
                    onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                    className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    Technical Requirements
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Specific languages, frameworks, test suites or version requirements…"
                    value={form.requirements}
                    onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                    className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                  Expected Deliverables
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. GitHub Pull Request with passing unit tests and documentation update"
                  value={form.deliverables}
                  onChange={(e) => setForm({ ...form, deliverables: e.target.value })}
                  className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                />
              </div>
            </div>

            {/* Section 3: Rules & Contributor Instructions */}
            <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-5">
              <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                <ShieldAlert size={18} />
                <h2 className="font-display font-bold text-lg">3. Rules & Submission Guidelines</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    Contribution Rules
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Code standards, branch naming, licensing, or IP assignment rules…"
                    value={form.rules}
                    onChange={(e) => setForm({ ...form, rules: e.target.value })}
                    className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    Eligibility Criteria
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Any contributor prerequisites, experience level, or KYC requirements…"
                    value={form.eligibility}
                    onChange={(e) => setForm({ ...form, eligibility: e.target.value })}
                    className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                  Submission Instructions for Developers
                </label>
                <textarea
                  rows={2}
                  placeholder="What must developers include when submitting work? (e.g. PR URL, test coverage report, demo recording)"
                  value={form.submissionInstructions}
                  onChange={(e) => setForm({ ...form, submissionInstructions: e.target.value })}
                  className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                  Acceptance Criteria <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Explicit conditions for approving payout (e.g. all 12 tests pass on CI, creator code review approved)"
                  value={form.acceptanceCriteria}
                  onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })}
                  className="w-full border-2 border-black px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
                />
              </div>
            </div>

            {/* Section 4: Reward Escrow & Timeline */}
            <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-5">
              <div className="flex items-center gap-2 border-b-2 border-black pb-3">
                <DollarSign size={18} />
                <h2 className="font-display font-bold text-lg">4. Reward Escrow & Timeline</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    USDC Reward Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="10.00"
                      value={form.rewardRaw}
                      onChange={(e) => setForm({ ...form, rewardRaw: e.target.value })}
                      className="w-full border-2 border-black pl-9 pr-3 py-2.5 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>
                  {parsedReward && (
                    <div className="mt-1.5 p-2 bg-yellow-50 border border-black text-[11px] font-mono text-gray-700">
                      <div>Formatted: <span className="font-bold">{form.rewardRaw} USDC</span></div>
                      <div>Base Atomic Units: <span className="font-bold">{parsedReward.raw.toString()}</span> (6 decimals)</div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                    Submission Deadline (Days) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.deadlineDays}
                      onChange={(e) => setForm({ ...form, deadlineDays: e.target.value })}
                      className="w-full border-2 border-black pl-9 pr-3 py-2.5 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>
                  {form.deadlineDays && (
                    <div className="mt-1.5 p-2 bg-gray-50 border border-black text-[11px] text-gray-700">
                      Closes on: <strong className="font-mono">{new Date(Date.now() + Number(form.deadlineDays) * 86400000).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Escrow Guarantee Callout */}
              <div className="bg-yellow-50 border-2 border-black p-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-black">
                  <ShieldAlert size={16} className="text-yellow-700" />
                  <span>Non-Custodial Onchain Escrow Contract</span>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Funds will be deposited into the verified BountyBoard smart contract (
                  <code className="bg-white px-1 border border-black font-mono">{BOUNTY_BOARD_ADDRESS.slice(0, 10)}…</code>
                  ). TaskFi V1 has zero platform fees. If no acceptable submission is approved before the deadline plus grace period, you can reclaim your full deposit.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleCreate}
                disabled={createPending || createConfirming || !user || !isConnected}
                className="w-full border-2 border-black bg-black text-white py-4 font-black text-sm uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-50 shadow-[4px_4px_0px_#EAB308] active:translate-x-0.5 active:translate-y-0.5"
              >
                {createPending
                  ? 'Confirm in Wallet…'
                  : createConfirming
                  ? 'Creating Onchain (Step 1/3)…'
                  : `Deploy Bounty & Proceed to Escrow`}
              </button>
            </div>
          </div>

          {/* Side Sticky Live Preview Card (4 cols on desktop) */}
          <div className={`lg:col-span-4 ${showPreviewModal ? 'block' : 'hidden lg:block'} sticky top-24 space-y-4`}>
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <span className="font-display font-bold text-sm uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={16} className="text-yellow-600" />
                Live Card Preview
              </span>
              <span className="text-[11px] text-gray-500 font-mono">Explore feed preview</span>
            </div>

            {/* Simulated BountyCard */}
            <div className="bg-white border-2 border-black shadow-[6px_6px_0px_black] p-5 space-y-4">
              {form.imageUrl ? (
                <div className="border-2 border-black overflow-hidden h-36 bg-gray-100">
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 h-28 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                  <span>No cover image selected</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border border-black shadow-[1px_1px_0px_black]"
                    style={{ backgroundColor: selectedCategoryObj?.color || '#FDE047' }}
                  >
                    {selectedCategoryObj?.name || 'Category'}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold border border-black bg-blue-100 text-blue-900">
                    Open (Pending Escrow)
                  </span>
                </div>

                <h3 className="font-display font-bold text-base leading-snug line-clamp-2">
                  {form.title.trim() || 'Untitled Bounty'}
                </h3>
              </div>

              <div className="flex flex-wrap gap-1">
                {form.tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-300">
                      #{tag}
                    </span>
                  ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-200 text-xs">
                <span className="font-bold flex items-center gap-1 text-black font-mono">
                  <DollarSign size={14} />
                  {form.rewardRaw || '0.00'} USDC
                </span>
                <span className="flex items-center gap-1 text-gray-600 font-mono text-[11px]">
                  <Clock size={12} />
                  {form.deadlineDays}d left
                </span>
              </div>
            </div>

            <div className="p-3 bg-white border-2 border-black text-xs text-gray-600 shadow-[2px_2px_0px_black]">
              <p className="font-bold text-black mb-1">Preview Tips:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Detailed requirements increase contribution quality by 3x.</li>
                <li>Clear acceptance criteria protect both creator and contributor.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: APPROVE */}
      {step === 'approve' && (
        <div className="max-w-xl mx-auto space-y-5 bg-white border-2 border-black p-8 shadow-[6px_6px_0px_black]">
          <div className="flex items-center gap-2 border-b-2 border-black pb-3">
            <span className="w-6 h-6 rounded-full bg-yellow-300 border-2 border-black text-xs font-black flex items-center justify-center">
              2
            </span>
            <h2 className="font-display font-black text-xl">Approve USDC Allowance</h2>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed">
            Authorize the verified BountyBoard escrow smart contract to transfer{' '}
            <strong className="tabular-nums font-bold text-black">{form.rewardRaw} USDC</strong> from your connected
            wallet.
          </p>

          {createHash && (
            <div className="p-3 bg-gray-50 border border-black text-xs font-mono">
              <span className="text-gray-500">Creation Tx: </span>
              <a
                href={explorerTx(createHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-black inline-flex items-center gap-1"
              >
                {createHash.slice(0, 14)}…{createHash.slice(-8)}
                <ExternalLink size={12} />
              </a>
            </div>
          )}

          <button
            onClick={handleApprove}
            disabled={approvePending || approveConfirming}
            className="w-full border-2 border-black bg-black text-white py-3.5 font-bold text-sm uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60 shadow-[4px_4px_0px_#EAB308]"
          >
            {approvePending ? 'Confirm in Wallet…' : approveConfirming ? 'Approving USDC…' : 'Approve USDC'}
          </button>
        </div>
      )}

      {/* STEP 3: FUND */}
      {step === 'fund' && (
        <div className="max-w-xl mx-auto space-y-5 bg-white border-2 border-black p-8 shadow-[6px_6px_0px_black]">
          <div className="flex items-center gap-2 border-b-2 border-black pb-3">
            <span className="w-6 h-6 rounded-full bg-yellow-300 border-2 border-black text-xs font-black flex items-center justify-center">
              3
            </span>
            <h2 className="font-display font-black text-xl">Deposit Reward into Escrow</h2>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed">
            Deposit <strong className="tabular-nums font-bold text-black">{form.rewardRaw} USDC</strong> directly into
            the smart contract. Funds are programmatically secured until you verify and approve an open-source
            contributor&apos;s solution.
          </p>

          <button
            onClick={handleFund}
            disabled={fundPending || fundConfirming}
            className="w-full border-2 border-black bg-black text-white py-4 font-black text-sm uppercase tracking-wider hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60 shadow-[4px_4px_0px_#EAB308]"
          >
            {fundPending
              ? 'Confirm in Wallet…'
              : fundConfirming
              ? 'Depositing Escrow…'
              : `Deposit ${form.rewardRaw} USDC & Launch Bounty`}
          </button>
        </div>
      )}

      {/* STEP 4: DONE */}
      {step === 'done' && (
        <div className="max-w-lg mx-auto border-2 border-black p-8 bg-green-50 shadow-[6px_6px_0px_black] text-center space-y-4">
          <div className="w-16 h-16 border-2 border-black bg-green-300 flex items-center justify-center mx-auto text-3xl font-bold shadow-[3px_3px_0px_black]">
            ✓
          </div>
          <h2 className="font-display font-black text-2xl">Bounty Escrow Active!</h2>
          <p className="text-sm text-gray-700">
            Your bounty is now published on Arc Testnet, indexed in PostgreSQL, and visible in the public Explore directory.
          </p>
          {fundHash && (
            <div>
              <a
                href={explorerTx(fundHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-black underline font-mono"
              >
                <ExternalLink size={12} />
                Funding Tx: {fundHash.slice(0, 10)}…{fundHash.slice(-8)}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

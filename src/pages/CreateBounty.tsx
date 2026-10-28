import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, parseEventLogs } from 'viem'
import { toast } from 'sonner'
import { Info, ExternalLink, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react'
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
import { apiSaveBounty } from '@/lib/api'
import { NetworkGuard } from '@/components/ui/NetworkGuard'
import { ConnectKitButton } from 'connectkit'

type Step = 'create' | 'approve' | 'fund' | 'done'

export function CreateBounty() {
  const navigate = useNavigate()
  const { user, signInWithGoogle } = useAuth()
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [form, setForm] = useState({
    title: '',
    description: '',
    acceptanceCriteria: '',
    rewardRaw: '',
    deadlineDays: '14',
    tags: '',
  })
  const [step, setStep] = useState<Step>('create')
  const [pendingBountyId, setPendingBountyId] = useState<number | null>(null)
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

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
      toast.error('Title is required.')
      return
    }
    if (!form.description.trim()) {
      toast.error('Description is required.')
      return
    }
    if (!parsedReward || parsedReward.raw <= 0n) {
      toast.error('Enter a valid reward amount.')
      return
    }
    if (Number(form.deadlineDays) < 1) {
      toast.error('Deadline must be at least 1 day.')
      return
    }

    // Generate contentHash of description
    const contentHash = `sha256:${btoa(unescape(encodeURIComponent(form.description))).slice(0, 32)}`

    createWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'createBounty',
      args: [form.title.trim(), contentHash, parsedReward.raw, BigInt(deadlineTs)],
    }, {
      onSuccess: () => {
        toast.success('Bounty created onchain! Now approve USDC spending…')
        setStep('approve')
      },
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  // Helper to persist metadata with retry capability
  const persistMetadata = async (id: number) => {
    setMetaSaveStatus('saving')
    try {
      // 1. Persist directly to PostgreSQL backend
      await apiSaveBounty({
        onchainId: id,
        creatorWallet: address?.toLowerCase() || '',
        title: form.title.trim(),
        description: form.description,
        acceptanceCriteria: form.acceptanceCriteria,
        rewardAmount: parsedReward ? parsedReward.raw.toString() : '0',
        deadline: new Date(deadlineTs * 1000).toISOString(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        links: [],
        txHash: createHash,
      }).catch((e) => console.warn('[CreateBounty] PostgreSQL save warning:', e))

      // 2. Persist to Firestore and local cache as fallback
      await saveBountyMeta(id, {
        creatorUid: user?.uid ?? 'anonymous',
        creatorAddress: address?.toLowerCase(),
        description: form.description,
        acceptanceCriteria: form.acceptanceCriteria,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })

      if (address) {
        await logActivity({
          bountyId: id,
          type: 'created',
          actorAddress: address,
          txHash: createHash,
          message: `Bounty #${id} "${form.title}" created`,
        }).catch(() => {})
      }
      setMetaSaveStatus('saved')
    } catch (err) {
      console.error('[CreateBounty] Failed to save metadata:', err)
      setMetaSaveStatus('failed')
    }
  }

  // Extract bountyId from create receipt once confirmed
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
      // Fallback topic decode
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
    approveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [BOUNTY_BOARD_ADDRESS, parsedReward.raw],
    }, {
      onSuccess: () => toast.success('USDC approved! Now fund the bounty…'),
      onError: (err) => toast.error(parseOnchainError(err)),
    })
  }

  useEffect(() => {
    if (approveSuccess) setStep('fund')
  }, [approveSuccess])

  // Step 3: Fund bounty
  const handleFund = () => {
    if (pendingBountyId === null) {
      toast.error('Bounty ID not confirmed yet. Please wait for transaction receipt.')
      return
    }
    fundWrite({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'fundBounty',
      args: [BigInt(pendingBountyId)],
    }, {
      onSuccess: (hash) => {
        toast.success('Bounty funded! Redirecting…')
        setStep('done')
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
    })
  }

  useEffect(() => {
    if (fundSuccess && step !== 'done') {
      setTimeout(() => {
        void navigate(pendingBountyId ? `/bounty/${pendingBountyId}` : '/explore')
      }, 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundSuccess])

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  return (
    <div className="max-w-2xl space-y-6">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl tracking-tight mb-1">Post a Bounty</h1>
        <p className="text-sm text-gray-500">
          Create an onchain bounty with USDC escrow. Contributors submit work and claim upon approval.
        </p>
      </div>

      {/* Auth & Wallet Requirement Gates */}
      {!user && (
        <div className="border-2 border-black bg-yellow-50 p-6 shadow-[4px_4px_0px_black] space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Info size={18} className="text-yellow-600" />
            <span>Sign in required</span>
          </div>
          <p className="text-sm text-gray-700">
            You must sign in with Google before posting a bounty. This links your bounty metadata so you can manage submissions in your dashboard.
          </p>
          <button
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 border-2 border-black bg-black text-white px-4 py-2 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[2px_2px_0px_black]"
          >
            Sign In with Google
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Info size={18} className="text-blue-600" />
            <span>Connect Wallet</span>
          </div>
          <p className="text-sm text-gray-600">
            Connect your Arc Testnet wallet to sign transactions and fund bounty escrow.
          </p>
          <ConnectKitButton />
        </div>
      )}

      {isWrongChain && (
        <div className="mb-4">
          <NetworkGuard><span /></NetworkGuard>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-3 border-2 border-black p-3 bg-white shadow-[2px_2px_0px_black]">
        {(['create', 'approve', 'fund'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 flex items-center justify-center text-xs font-bold border-2 border-black ${
                step === s
                  ? 'bg-yellow-300'
                  : (step === 'approve' && i === 0) || (step === 'fund' && i <= 1) || step === 'done'
                  ? 'bg-black text-white'
                  : 'bg-white'
              }`}
            >
              {i + 1}
            </span>
            <span className="text-xs font-medium capitalize hidden sm:block">
              {s === 'approve' ? 'Approve USDC' : s === 'fund' ? 'Fund Escrow' : 'Create Onchain'}
            </span>
            {i < 2 && <span className="text-gray-300 mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* Metadata Sync Alert if onchain created but firestore failed */}
      {metaSaveStatus === 'failed' && pendingBountyId && (
        <div className="border-2 border-red-500 bg-red-50 p-4 flex items-start justify-between gap-3 text-xs text-red-800">
          <div>
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <AlertTriangle size={14} className="text-red-600" />
              <span>Metadata Sync Notice</span>
            </div>
            <p>
              Your bounty was created onchain (ID #{pendingBountyId}), but saving off-chain description to Firestore encountered an issue.
            </p>
          </div>
          <button
            onClick={() => void persistMetadata(pendingBountyId)}
            className="border-2 border-red-600 bg-white px-2.5 py-1 text-xs font-bold hover:bg-red-100 flex items-center gap-1 shrink-0"
          >
            <RefreshCw size={12} /> Retry Sync
          </button>
        </div>
      )}

      {metaSaveStatus === 'saved' && pendingBountyId && (
        <div className="border-2 border-green-500 bg-green-50 p-3 flex items-center gap-2 text-xs text-green-800 font-bold">
          <CheckCircle2 size={14} className="text-green-600" />
          <span>Bounty #{pendingBountyId} metadata synchronized and linked to your account.</span>
        </div>
      )}

      {/* STEP 1: CREATE */}
      {step === 'create' && (
        <div className="space-y-5 bg-white border-2 border-black p-6 shadow-[4px_4px_0px_black]">
          <div>
            <label className="block text-sm font-bold mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={120}
              placeholder="Fix OAuth redirect flicker on page reload"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-1.5">
              Detailed task description, steps to reproduce, or link to GitHub issue.
            </p>
            <textarea
              rows={5}
              placeholder="Describe the bug, repository, where it occurs, and relevant environment context…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5">
              Acceptance Criteria <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="What must be demonstrated for approval? (e.g. Unit test passes, pull request merged, no regressions)"
              value={form.acceptanceCriteria}
              onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1.5">
                Reward (USDC) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="10.00"
                value={form.rewardRaw}
                onChange={(e) => setForm({ ...form, rewardRaw: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 tabular-nums"
              />
              {parsedReward && (
                <p className="text-xs text-gray-500 mt-1">
                  {parsedReward.toFixed(USDC_DECIMALS)} USDC (6 decimals)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">Deadline (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={form.deadlineDays}
                onChange={(e) => setForm({ ...form, deadlineDays: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 tabular-nums"
              />
              {form.deadlineDays && (
                <p className="text-xs text-gray-500 mt-1">
                  Closes {new Date(Date.now() + Number(form.deadlineDays) * 86400000).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="react, bug, typescript, smart-contracts"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
          </div>

          <div className="bg-yellow-50 border-2 border-yellow-400 p-3.5 flex gap-2.5 text-xs text-yellow-900">
            <Info size={16} className="shrink-0 mt-0.5 text-yellow-700" />
            <div>
              <strong>Process:</strong> Step 1 registers the bounty on Arc Testnet. Step 2 approves USDC transfer. Step 3 transfers reward into escrow.
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={createPending || createConfirming || !user || !isConnected}
            className="w-full border-2 border-black bg-black text-white py-3.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-50 shadow-[4px_4px_0px_#EAB308] active:translate-x-0.5 active:translate-y-0.5"
          >
            {createPending
              ? 'Confirm in wallet…'
              : createConfirming
              ? 'Creating onchain…'
              : 'Create Bounty (Step 1 of 3)'}
          </button>
        </div>
      )}

      {/* STEP 2: APPROVE */}
      {step === 'approve' && (
        <div className="space-y-5 bg-white border-2 border-black p-6 shadow-[4px_4px_0px_black]">
          <h2 className="font-display font-bold text-lg mb-2">Step 2: Approve USDC Spending</h2>
          <p className="text-sm text-gray-600">
            Authorize the BountyBoard contract to transfer <strong className="tabular-nums font-bold">{form.rewardRaw} USDC</strong> from your wallet.
          </p>
          {createHash && (
            <div className="pt-2">
              <a
                href={explorerTx(createHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-black underline"
              >
                <ExternalLink size={12} />
                View creation transaction on Arc Explorer
              </a>
            </div>
          )}
          <button
            onClick={handleApprove}
            disabled={approvePending || approveConfirming}
            className="w-full border-2 border-black bg-black text-white py-3.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60 shadow-[4px_4px_0px_#EAB308]"
          >
            {approvePending ? 'Confirm in wallet…' : approveConfirming ? 'Approving USDC…' : 'Approve USDC'}
          </button>
        </div>
      )}

      {/* STEP 3: FUND */}
      {step === 'fund' && (
        <div className="space-y-5 bg-white border-2 border-black p-6 shadow-[4px_4px_0px_black]">
          <h2 className="font-display font-bold text-lg mb-2">Step 3: Fund the Bounty Escrow</h2>
          <p className="text-sm text-gray-600">
            Deposit <strong className="tabular-nums font-bold">{form.rewardRaw} USDC</strong> into the smart contract. Funds remain safely in escrow until you approve an acceptable submission.
          </p>
          <button
            onClick={handleFund}
            disabled={fundPending || fundConfirming}
            className="w-full border-2 border-black bg-black text-white py-3.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60 shadow-[4px_4px_0px_#EAB308]"
          >
            {fundPending ? 'Confirm in wallet…' : fundConfirming ? 'Funding escrow…' : `Lock & Fund ${form.rewardRaw} USDC`}
          </button>
        </div>
      )}

      {/* STEP 4: DONE */}
      {step === 'done' && (
        <div className="border-2 border-black p-8 bg-green-50 shadow-[4px_4px_0px_black] text-center space-y-4">
          <div className="w-14 h-14 border-2 border-black bg-green-300 flex items-center justify-center mx-auto text-3xl font-bold shadow-[2px_2px_0px_black]">
            ✓
          </div>
          <h2 className="font-display font-bold text-xl">Bounty Funded & Active!</h2>
          <p className="text-sm text-gray-600">
            Your bounty is now published on Arc Testnet and visible in the public Explorer and your Dashboard.
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

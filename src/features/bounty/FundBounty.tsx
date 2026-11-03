import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Feedback'
import { FeeLedger } from '@/components/bounty/FeeLedger'
import { useTx, useUsdcAccount } from '@/hooks/useBountyContract'
import { useRefreshBounty } from '@/lib/api/queries'
import type { BountyDetail } from '@/lib/api/types'
import { formatUsdc, postFee } from '@/lib/money'

export function FundBounty({ bounty }: { bounty: BountyDetail }) {
  const tx = useTx()
  const usdc = useUsdcAccount()
  const refresh = useRefreshBounty()
  const [step, setStep] = useState<'idle' | 'approve' | 'fund'>('idle')

  const reward = BigInt(bounty.rewardAmount)
  const fee = postFee(reward)
  const total = reward + fee
  const short = usdc.balance !== undefined && usdc.balance < total

  const fund = async () => {
    try {
      if ((usdc.allowance ?? 0n) < total) {
        setStep('approve')
        await tx.approveUsdc(total)
      }
      setStep('fund')
      await tx.board('fundBounty', [BigInt(bounty.onchainId)])
      await usdc.refetch()
      await refresh(bounty.onchainId)
      toast.success('Bounty funded. An admin will review it before it appears on the platform.')
    } catch {
      // The message is already in tx.error.
    } finally {
      setStep('idle')
    }
  }

  const cancel = async () => {
    try {
      await tx.board('cancelBounty', [BigInt(bounty.onchainId)])
      await refresh(bounty.onchainId)
      toast.success('Bounty cancelled.')
    } catch {
      // shown below
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-mute">This bounty is created but not funded. Contributors cannot submit until the prize is in escrow.</p>
      <FeeLedger
        lines={[
          { label: 'Prize pool, held in escrow', value: `${formatUsdc(reward)} USDC` },
          { label: 'Platform fee, 0.5%', value: `${formatUsdc(fee, 4)} USDC` },
          { label: 'Leaves your wallet', value: `${formatUsdc(total, 4)} USDC`, total: true },
        ]}
      />
      {short && (
        <Callout tone="warn" title="Your USDC balance is too low">
          You hold {formatUsdc(usdc.balance ?? 0n, 4)} USDC.{' '}
          <a className="font-bold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">
            Get test USDC from the Circle faucet
          </a>
          .
        </Callout>
      )}
      <Button variant="primary" className="w-full" size="lg" loading={tx.pending} disabled={short} onClick={() => void fund()}>
        {step === 'approve' ? 'Approve USDC in your wallet' : step === 'fund' ? 'Confirm the funding transaction' : `Fund ${formatUsdc(total, 4)} USDC`}
      </Button>
      <Button variant="danger" className="w-full" disabled={tx.pending} onClick={() => void cancel()}>
        Cancel this bounty
      </Button>
      {tx.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tx.error}
        </p>
      )}
    </div>
  )
}

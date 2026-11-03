import { useCallback, useState } from 'react'
import { erc20Abi, type Abi, type ContractFunctionArgs, type ContractFunctionName, type TransactionReceipt } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { BOUNTY_BOARD_ABI } from '@/lib/bountyBoardAbi'
import { appChain } from '@/lib/chain'
import { useAppConfig } from '@/lib/api/queries'
import { describeTxError } from '@/lib/txErrors'

type WriteName = ContractFunctionName<typeof BOUNTY_BOARD_ABI, 'nonpayable'>

export interface TxResult {
  hash: `0x${string}`
  receipt: TransactionReceipt
}

/**
 * Sends a transaction and waits for it to be mined. `pending` covers both the wallet prompt and
 * the confirmation wait; failures are turned into a plain sentence in `error`.
 */
export function useTx() {
  const config = useAppConfig()
  const publicClient = usePublicClient({ chainId: appChain.id })
  const { writeContractAsync } = useWriteContract()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (request: { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<TxResult> => {
      if (!publicClient) throw new Error('The network connection is not ready yet.')
      setPending(true)
      setError(null)
      try {
        const hash = await writeContractAsync({ ...request, chainId: appChain.id })
        const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1_000 })
        if (receipt.status !== 'success') throw new Error('The transaction was mined but failed. Check the bounty state and try again.')
        return { hash, receipt }
      } catch (err) {
        const message = describeTxError(err)
        setError(message)
        throw new Error(message)
      } finally {
        setPending(false)
      }
    },
    [publicClient, writeContractAsync],
  )

  /** Calls a BountyBoard function. */
  const board = useCallback(
    <N extends WriteName>(functionName: N, args: ContractFunctionArgs<typeof BOUNTY_BOARD_ABI, 'nonpayable', N>) => {
      const address = config.data?.contractAddress
      if (!address) throw new Error('The bounty contract is not configured.')
      return run({ address, abi: BOUNTY_BOARD_ABI, functionName, args: args as readonly unknown[] })
    },
    [config.data?.contractAddress, run],
  )

  /** Approves the contract to pull `amount` USDC. */
  const approveUsdc = useCallback(
    (amount: bigint) => {
      const board_ = config.data?.contractAddress
      const usdc = config.data?.usdcAddress
      if (!board_ || !usdc) throw new Error('The bounty contract is not configured.')
      return run({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [board_, amount] })
    },
    [config.data?.contractAddress, config.data?.usdcAddress, run],
  )

  return { board, approveUsdc, pending, error, clearError: () => setError(null) }
}

/** The connected wallet's USDC balance and its allowance for the bounty contract. */
export function useUsdcAccount() {
  const config = useAppConfig()
  const { address } = useAccount()
  const usdc = config.data?.usdcAddress
  const spender = config.data?.contractAddress
  const enabled = Boolean(address && usdc)

  const balance = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled, refetchInterval: 15_000 },
  })
  const allowance = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    chainId: appChain.id,
    query: { enabled: enabled && Boolean(spender), refetchInterval: 15_000 },
  })

  return {
    balance: balance.data,
    allowance: allowance.data,
    refetch: async () => {
      await Promise.all([balance.refetch(), allowance.refetch()])
    },
  }
}

export { BOUNTY_BOARD_ABI }

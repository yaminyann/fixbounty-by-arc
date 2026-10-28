import { useReadContract, useReadContracts } from 'wagmi'
import { BOUNTY_BOARD_ADDRESS, BOUNTY_BOARD_ABI, TARGET_CHAIN_ID } from '@/lib/contract'
import { normalizeBounty, type Bounty } from '@/lib/bountyTypes'

export function useBounty(bountyId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: BOUNTY_BOARD_ADDRESS,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getBounty',
    args: bountyId !== undefined ? [BigInt(bountyId)] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: bountyId !== undefined },
  })

  const bounty = data ? normalizeBounty(data) : null
  return { bounty, isLoading, error, refetch }
}

export function useBountyCount() {
  const { data, isLoading, refetch } = useReadContract({
    address: BOUNTY_BOARD_ADDRESS,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getBountyCount',
    chainId: TARGET_CHAIN_ID,
  })
  return { count: data ? Number(data) : 0, isLoading, refetch }
}

export function useBounties(ids: number[]) {
  const contracts = ids.map((id) => ({
    address: BOUNTY_BOARD_ADDRESS,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getBounty' as const,
    args: [BigInt(id)] as [bigint],
    chainId: TARGET_CHAIN_ID,
  }))

  const { data, isLoading, refetch } = useReadContracts({ contracts })

  const bounties: Bounty[] = []
  if (data) {
    for (const result of data) {
      if (result.status === 'success' && result.result) {
        bounties.push(normalizeBounty(result.result))
      }
    }
  }

  return { bounties, isLoading, refetch }
}

export function useHasSubmitted(bountyId: number | undefined, address: `0x${string}` | undefined) {
  const { data } = useReadContract({
    address: BOUNTY_BOARD_ADDRESS,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'hasSubmitted',
    args: bountyId !== undefined && address ? [BigInt(bountyId), address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: bountyId !== undefined && !!address },
  })
  return !!data
}

import { createPublicClient, defineChain, http, BaseError, ContractFunctionRevertedError, type Address } from 'viem'
import { config } from './config.js'
import { BOUNTY_BOARD_ABI } from './abi.js'
import { HttpError } from './lib/http.js'

export const arcChain = defineChain({
  id: config.chain.id,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [config.chain.rpcUrl] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: config.chain.explorerUrl } },
})

export const publicClient = createPublicClient({
  chain: arcChain,
  // JSON-RPC batching turns the three reads for one bounty into a single HTTP round trip.
  transport: http(config.chain.rpcUrl, { batch: { wait: 10 }, timeout: 15_000, retryCount: 2 }),
})

export function contractAddress(): Address {
  const address = config.chain.contractAddress
  if (!address) throw new HttpError(503, 'BountyBoard contract address is not configured.')
  return address
}

export interface OnchainBounty {
  id: number
  creator: Address
  title: string
  contentHash: string
  reward: bigint
  deadline: bigint
  status: number
  fundedAt: bigint
  approvedAt: bigint
  unclaimedAmount: bigint
  submissionCount: number
  winnerSlots: number
  winnerCount: number
  claimedCount: number
  sharesBps: number[]
  payouts: bigint[]
  winners: Address[]
  winnersClaimed: boolean[]
}

function isBountyNotFound(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
  return reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === 'BountyNotFound'
}

/** Reads the full state of a bounty. Returns null when the id does not exist on-chain. */
export async function readBounty(onchainId: number): Promise<OnchainBounty | null> {
  const address = contractAddress()
  const id = BigInt(onchainId)
  try {
    const [bounty, prize, winnerInfo] = await Promise.all([
      publicClient.readContract({ address, abi: BOUNTY_BOARD_ABI, functionName: 'getBounty', args: [id] }),
      publicClient.readContract({ address, abi: BOUNTY_BOARD_ABI, functionName: 'getPrizeStructure', args: [id] }),
      publicClient.readContract({ address, abi: BOUNTY_BOARD_ABI, functionName: 'getWinners', args: [id] }),
    ])
    return {
      id: Number(bounty.id),
      creator: bounty.creator.toLowerCase() as Address,
      title: bounty.title,
      contentHash: bounty.contentHash,
      reward: bounty.reward,
      deadline: bounty.deadline,
      status: Number(bounty.status),
      fundedAt: bounty.fundedAt,
      approvedAt: bounty.approvedAt,
      unclaimedAmount: bounty.unclaimedAmount,
      submissionCount: Number(bounty.submissionCount),
      winnerSlots: Number(bounty.winnerSlots),
      winnerCount: Number(bounty.winnerCount),
      claimedCount: Number(bounty.claimedCount),
      sharesBps: prize[0].map(Number),
      payouts: [...prize[1]],
      winners: winnerInfo[0].map((w) => w.toLowerCase() as Address),
      winnersClaimed: [...winnerInfo[1]],
    }
  } catch (err) {
    if (isBountyNotFound(err)) return null
    throw err
  }
}

export async function readSubmissionHash(onchainId: number, contributor: Address): Promise<string | null> {
  const [hash, exists] = await publicClient.readContract({
    address: contractAddress(),
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getSubmission',
    args: [BigInt(onchainId), contributor],
  })
  return exists ? hash : null
}

export async function readBountyCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: contractAddress(),
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getBountyCount',
  })
  return Number(count)
}

export async function verifyWalletSignature(address: Address, message: string, signature: `0x${string}`): Promise<boolean> {
  try {
    // Handles both EOAs and ERC-1271 smart-contract wallets.
    return await publicClient.verifyMessage({ address, message, signature })
  } catch {
    return false
  }
}

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

export async function readTreasuryBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: config.chain.usdcAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [config.chain.treasuryAddress],
  })
}

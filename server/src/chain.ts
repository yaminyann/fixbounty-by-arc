import { createPublicClient, http, defineChain, type Hash, type Address, verifyMessage } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.testnet.arc.io' },
  },
})

export const BOUNTY_BOARD_ADDRESS = (process.env.BOUNTY_BOARD_ADDRESS ||
  process.env.VITE_BOUNTY_BOARD_ADDRESS ||
  '0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb') as Address

export const BOUNTY_BOARD_ABI = [
  {
    type: 'function',
    name: 'getBountyCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBounty',
    inputs: [{ name: '_id', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'creator', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'contentHash', type: 'string' },
          { name: 'reward', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'approvedContributor', type: 'address' },
          { name: 'fundedAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'),
})

export interface OnchainBountyData {
  id: bigint
  creator: Address
  title: string
  contentHash: string
  reward: bigint
  deadline: bigint
  status: number
  approvedContributor: Address
  fundedAt: bigint
}

export async function fetchOnchainBounty(id: number): Promise<OnchainBountyData | null> {
  try {
    const raw = (await publicClient.readContract({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'getBounty',
      args: [BigInt(id)],
    })) as [bigint, Address, string, string, bigint, bigint, number, Address, bigint] | {
      id: bigint
      creator: Address
      title: string
      contentHash: string
      reward: bigint
      deadline: bigint
      status: number
      approvedContributor: Address
      fundedAt: bigint
    }

    if (Array.isArray(raw)) {
      return {
        id: raw[0],
        creator: raw[1],
        title: raw[2],
        contentHash: raw[3],
        reward: raw[4],
        deadline: raw[5],
        status: raw[6],
        approvedContributor: raw[7],
        fundedAt: raw[8],
      }
    }

    return raw as OnchainBountyData
  } catch (err) {
    console.warn(`[Chain] Failed to fetch onchain bounty #${id}:`, err)
    return null
  }
}

export async function verifyTxReceipt(txHash: string): Promise<boolean> {
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as Hash,
    })
    return receipt && receipt.status === 'success'
  } catch {
    return false
  }
}

export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    return await verifyMessage({
      address: address as Address,
      message,
      signature: signature as `0x${string}`,
    })
  } catch (err) {
    console.error('[Chain] Signature verification failed:', err)
    return false
  }
}

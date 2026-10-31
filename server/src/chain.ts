import { createPublicClient, http, defineChain, type Hash, type Address, verifyMessage } from 'viem'
import { query } from './db.js'

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

export async function fetchOnchainBountyCount(): Promise<number> {
  try {
    const count = await publicClient.readContract({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'getBountyCount',
    })
    return Number(count)
  } catch (err) {
    console.warn('[Chain] Failed to fetch onchain bounty count:', err)
    return 0
  }
}

let lastSyncTimestamp = 0
let isSyncing = false

export async function syncOnchainBounties(force = false): Promise<{ synced: number; total: number }> {
  const now = Date.now()
  if (!force && now - lastSyncTimestamp < 15_000) {
    return { synced: 0, total: 0 }
  }
  if (isSyncing) return { synced: 0, total: 0 }

  isSyncing = true
  lastSyncTimestamp = now

  let synced = 0
  let total = 0

  try {
    total = await fetchOnchainBountyCount()
    if (total <= 0) return { synced: 0, total: 0 }

    for (let id = 1; id <= total; id++) {
      try {
        const existingRes = await query<{
          id: string
          onchain_id: number
          onchain_status: number
          title: string
        }>(
          'SELECT id, onchain_id, onchain_status, title FROM bounties WHERE onchain_id = $1',
          [id]
        )

        const onchainData = await fetchOnchainBounty(id)
        if (!onchainData || onchainData.creator.toLowerCase() === '0x0000000000000000000000000000000000000000') {
          continue
        }

        if (existingRes.rows.length === 0) {
          // Missing from PostgreSQL -> Insert onchain bounty
          const deadlineDate = new Date(Number(onchainData.deadline) * 1000)
          await query(
            `
            INSERT INTO bounties (
              onchain_id,
              creator_wallet,
              title,
              description,
              acceptance_criteria,
              reward_amount,
              token_symbol,
              token_address,
              deadline,
              category_slug,
              moderation_status,
              onchain_status,
              contract_version,
              tags
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'USDC', '0x3600000000000000000000000000000000000000', $7, 'bug-fix', 'approved', $8, 1, ARRAY['arc', 'smart-contract'])
            ON CONFLICT (onchain_id) DO UPDATE SET
              onchain_status = EXCLUDED.onchain_status,
              updated_at = NOW()
            `,
            [
              id,
              onchainData.creator.toLowerCase(),
              onchainData.title || `Task #${id}`,
              `Task #${id} registered on Arc Testnet. Content Hash: ${onchainData.contentHash || 'N/A'}.`,
              'Complete the required deliverable and submit verified pull request / proof for on-chain approval.',
              onchainData.reward.toString(),
              deadlineDate,
              onchainData.status,
            ]
          )
          synced++
        } else {
          // Exists -> Check if status has changed onchain (e.g. funded, approved, claimed)
          const current = existingRes.rows[0]
          if (current.onchain_status !== onchainData.status) {
            await query(
              'UPDATE bounties SET onchain_status = $1, updated_at = NOW() WHERE onchain_id = $2',
              [onchainData.status, id]
            )
            synced++
          }
        }
      } catch (innerErr) {
        console.warn(`[Chain] Error syncing bounty #${id}:`, innerErr)
      }
    }
  } catch (err) {
    console.warn('[Chain] syncOnchainBounties failed:', err)
  } finally {
    isSyncing = false
  }

  return { synced, total }
}

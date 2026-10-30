/**
 * TaskFi Contract and Network Re-exports
 *
 * Keeps active deployed contract address:
 * 0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb (Arc Testnet)
 * Preserves full compatibility with all existing imports.
 */
import { BOUNTY_BOARD_V2_ABI } from '@/lib/contractV2'

export {
  ACTIVE_NETWORK,
  TARGET_CHAIN_ID,
  TARGET_CHAIN,
  TARGET_USDC as USDC,
  USDC_ADDRESS,
  USDC_DECIMALS,
  BOUNTY_BOARD_ADDRESS,
  BOUNTY_BOARD_V1_TESTNET,
  BOUNTY_BOARD_V2_TESTNET,
  BOUNTY_BOARD_V2_MAINNET,
  BOUNTY_BOARD_V2_ADDRESS,
  isV2Contract,
  V2_DEPLOYED,
  EXPLORER_BASE,
  ARC_EXPLORER_URL,
  explorerTx,
  explorerAddr,
} from '@/lib/networkConfig'

export { BOUNTY_BOARD_V2_ABI }

// Minimal V1 ABI (pure non-custodial escrow, no fees)
export const BOUNTY_BOARD_V1_ABI = [
  {
    type: 'function',
    name: 'getBounty',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [
      {
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
  },
  {
    type: 'function',
    name: 'getBountyCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getSubmission',
    stateMutability: 'view',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'contributor', type: 'address' },
    ],
    outputs: [
      { name: 'submissionHash', type: 'string' },
      { name: 'exists', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'hasSubmitted',
    stateMutability: 'view',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'contributor', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'createBounty',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'contentHash', type: 'string' },
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'bountyId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'fundBounty',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitWork',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'submissionHash', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approveBounty',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'contributor', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimReward',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundBounty',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundAfterApproval',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelBounty',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'CLAIM_GRACE_PERIOD',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'usdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const

// Active unified ABI covering all supported functions
export const BOUNTY_BOARD_ABI = BOUNTY_BOARD_V2_ABI

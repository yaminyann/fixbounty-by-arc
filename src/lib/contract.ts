/**
 * FixBounty contract configuration — wire deployed address + ABI.
 * Address is read from .env so it can be updated without a code change.
 */
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'

// Chain target
export const TARGET_CHAIN_ID = 5042002 // Arc Testnet

export const TARGET_CHAIN = requireChain(TARGET_CHAIN_ID)

export const USDC = getUsdc(TARGET_CHAIN_ID)!
export const USDC_ADDRESS = USDC.address as `0x${string}`
export const USDC_DECIMALS = USDC.decimals

export const BOUNTY_BOARD_ADDRESS = (
  import.meta.env.VITE_BOUNTY_BOARD_ADDRESS ?? '0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb'
) as `0x${string}`

export const EXPLORER_BASE = TARGET_CHAIN.explorerBase
export const ARC_EXPLORER_URL = EXPLORER_BASE

export function explorerTx(hash: `0x${string}`) {
  return buildTxExplorerUrl(TARGET_CHAIN_ID, hash)
}

export function explorerAddr(addr: string) {
  return `${EXPLORER_BASE}/address/${addr}`
}

// ----- ABI (minimal — all state-changing + view functions used by the frontend) -----
export const BOUNTY_BOARD_ABI = [
  // View
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
    name: 'CLAIM_GRACE_PERIOD',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Write
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
  // Events
  {
    type: 'event',
    name: 'BountyCreated',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BountyFunded',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WorkSubmitted',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'contributor', type: 'address', indexed: true },
      { name: 'submissionHash', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BountyApproved',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'contributor', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RewardClaimed',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'contributor', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BountyRefunded',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BountyCancelled',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
    ],
  },
  // Custom errors
  { type: 'error', name: 'BountyNotFound', inputs: [] },
  { type: 'error', name: 'NotCreator', inputs: [] },
  { type: 'error', name: 'NotApprovedContributor', inputs: [] },
  { type: 'error', name: 'InvalidStatus', inputs: [] },
  { type: 'error', name: 'DeadlinePassed', inputs: [] },
  { type: 'error', name: 'DeadlineNotPassed', inputs: [] },
  { type: 'error', name: 'GracePeriodNotOver', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'ZeroReward', inputs: [] },
  { type: 'error', name: 'InvalidDeadline', inputs: [] },
  { type: 'error', name: 'EmptyTitle', inputs: [] },
  { type: 'error', name: 'AlreadySubmitted', inputs: [] },
  { type: 'error', name: 'SelfSubmission', inputs: [] },
  { type: 'error', name: 'NoSubmission', inputs: [] },
  { type: 'error', name: 'EmptySubmissionHash', inputs: [] },
] as const

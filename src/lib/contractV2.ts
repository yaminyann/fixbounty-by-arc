/**
 * BountyBoardV2 ABI — includes platform fee functions.
 * Deployed on Arc Testnet at 0xfdba32f2f2dbecd193b44ac2182f45a4a998d9bf
 */

export const BOUNTY_BOARD_V2_ABI = [
  // ---- Owner functions ----
  {
    type: 'function', name: 'setFeeBps', stateMutability: 'nonpayable',
    inputs: [{ name: 'newFeeBps', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'setTreasury', stateMutability: 'nonpayable',
    inputs: [{ name: 'newTreasury', type: 'address' }], outputs: [],
  },
  {
    type: 'function', name: 'transferOwnership', stateMutability: 'nonpayable',
    inputs: [{ name: 'newOwner', type: 'address' }], outputs: [],
  },
  {
    type: 'function', name: 'acceptOwnership', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
  // ---- Bounty lifecycle ----
  {
    type: 'function', name: 'createBounty', stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'contentHash', type: 'string' },
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'bountyId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'fundBounty', stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'submitWork', stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'submissionHash', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'approveBounty', stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'contributor', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'claimReward', stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'refundBounty', stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'refundAfterApproval', stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'cancelBounty', stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [],
  },
  // ---- View ----
  {
    type: 'function', name: 'getBounty', stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{
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
    }],
  },
  {
    type: 'function', name: 'getBountyCount', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'getSubmission', stateMutability: 'view',
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
    type: 'function', name: 'hasSubmitted', stateMutability: 'view',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'contributor', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'getFeeForBounty', stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{ name: 'snapshotFeeBps', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getTreasuryForBounty', stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{ name: 'snapshotTreasury', type: 'address' }],
  },
  {
    type: 'function', name: 'previewFee', stateMutability: 'view',
    inputs: [{ name: 'rewardAmount', type: 'uint256' }],
    outputs: [
      { name: 'feeAmount', type: 'uint256' },
      { name: 'contributorPayout', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'feeBps', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'treasury', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'owner', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'pendingOwner', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'MAX_FEE_BPS', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'CLAIM_GRACE_PERIOD', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'usdc', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }],
  },
  // ---- Events ----
  {
    type: 'event', name: 'BountyCreated',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'reward', type: 'uint256' },
      { indexed: false, name: 'deadline', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'BountyFunded',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'reward', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'WorkSubmitted',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'contributor', type: 'address' },
      { indexed: false, name: 'submissionHash', type: 'string' },
    ],
  },
  {
    type: 'event', name: 'BountyApproved',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'contributor', type: 'address' },
    ],
  },
  {
    type: 'event', name: 'RewardClaimed',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'contributor', type: 'address' },
      { indexed: false, name: 'reward', type: 'uint256' },
      { indexed: false, name: 'feeAmount', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'BountyRefunded',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'reward', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'BountyCancelled',
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
    ],
  },
  {
    type: 'event', name: 'FeeBpsUpdated',
    inputs: [
      { indexed: true, name: 'oldFeeBps', type: 'uint256' },
      { indexed: true, name: 'newFeeBps', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'TreasuryUpdated',
    inputs: [
      { indexed: true, name: 'oldTreasury', type: 'address' },
      { indexed: true, name: 'newTreasury', type: 'address' },
    ],
  },
] as const

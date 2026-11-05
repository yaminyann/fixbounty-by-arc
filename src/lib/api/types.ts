export type Moderation = 'pending' | 'approved' | 'rejected'

/** Mirrors the contract's BountyStatus enum. */
export enum Status {
  Open = 0,
  Funded = 1,
  Approved = 2,
  Claimed = 3,
  Refunded = 4,
  Cancelled = 5,
}

export interface AppConfig {
  chainId: number
  contractAddress: `0x${string}` | null
  usdcAddress: `0x${string}`
  treasuryAddress: `0x${string}`
  explorerUrl: string
  postFeeBps: number
  claimFeeBps: number
  claimGraceSeconds: number
  reviewSeconds: number
  maxWinners: number
}

export interface BountySummary {
  id: string
  onchainId: number
  title: string
  summary: string
  creatorWallet: string
  rewardAmount: string
  tokenSymbol: string
  deadline: string
  status: Status
  tags: string[]
  prizeShares: number[]
  winnerSlots: number
  winnerCount: number
  claimedCount: number
  submissionCount: number
  moderationStatus: Moderation
  category: string | null
  difficulty: Difficulty | null
  skills: string[]
  workMode: WorkMode
  confidential: boolean
  acceptsApplications: boolean
  assignedCount: number
  projectSlug: string | null
  projectName: string | null
  milestoneCount: number
  createdAt: string
}

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'
export type WorkMode = 'solo' | 'team'
export type ReviewStatus = 'submitted' | 'changes_requested' | 'approved' | 'rejected'

export interface BountyDetail extends BountySummary {
  submissionInstructions: string | null
  eligibility: string | null
  recurringProgramId: string | null
  projectLogo: string | null
  /** The creator's public key, present only on confidential bounties. */
  creatorEncryptionKey: JsonWebKey | null
  viewerCanReview: boolean
  description: string | null
  acceptanceCriteria: string | null
  links: string[]
  contentHash: string
  metadataVerified: boolean
  prizePayouts: string[]
  winners: string[]
  winnersClaimed: boolean[]
  unclaimedAmount: string
  fundedAt: string | null
  approvedAt: string | null
  txHash: string | null
  moderationNote: string | null
  moderatedAt: string | null
  syncedAt: string
  creatorUserId: string | null
  creatorName: string | null
  creatorPhoto: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type SubmissionStatus = 'pending' | 'winner' | 'not_selected'

export interface Submission {
  id: string
  submitterWallet: string
  description: string | null
  pullRequestUrl: string | null
  attachments: string[]
  notesVerified: boolean
  position: number | null
  txHash: string | null
  createdAt: string
  submitterName: string | null
  submitterPhoto: string | null
  status: SubmissionStatus
  /** Only the creator, the contributor and admins receive these two. */
  reviewStatus: ReviewStatus | null
  commentCount: number | null
  prState: 'open' | 'closed' | 'merged' | 'not_found' | null
  prMerged: boolean | null
  prAuthor: string | null
  prTitle: string | null
  prCheckedAt: string | null
  prAuthorMatchesProfile: boolean
}

export interface ActivityItem {
  id: string
  onchainId: number
  kind: 'created' | 'funded' | 'submitted' | 'winner' | 'approved' | 'claimed' | 'refunded' | 'cancelled'
  actorWallet: string | null
  position: number | null
  amount: string | null
  fee: string | null
  txHash: string
  time: string
  bountyTitle: string
}

export interface PublicStats {
  liveBounties: number
  totalPosted: string
  totalPaidOut: string
  submissions: number
  builders: number
}

export interface Me {
  user: { id: string; email: string | null; displayName: string | null; photoUrl: string | null }
  wallet: string | null
  isAdmin: boolean
}

export interface MyBounty extends Omit<BountySummary, 'summary'> {
  moderationNote: string | null
  metadataVerified: boolean
}

export interface MySubmission {
  id: string
  createdAt: string
  position: number | null
  notesVerified: boolean
  description: string | null
  pullRequestUrl: string | null
  onchainId: number
  bountyTitle: string
  bountyStatus: Status
  rewardAmount: string
  prizePayouts: string[]
  winners: string[]
  winnersClaimed: boolean[]
  approvedAt: string | null
  deadline: string
  moderationStatus: Moderation
  status: SubmissionStatus
  reviewStatus: ReviewStatus
  commentCount: number
}

export interface MySummary {
  created: { total: number; live: number; pending: number; escrowed: string }
  work: { submitted: number; won: number }
  earned: string
  feesPaid: string
}

// --- admin ---------------------------------------------------------------------

export interface AdminOverview {
  moderation: { pending: number; approved: number; rejected: number; unpublished: number }
  chainStatus: { status: number; count: number; reward: string }[]
  people: { users: number; new7d: number; wallets: number }
  work: { submissions: number; winners: number }
  revenue: {
    total: string
    day: string
    week: string
    month: string
    byKind: { kind: number; total: string; count: number }[]
    treasuryBalance: string | null
    treasuryAddress: string
  }
  series: { revenue: { day: string; amount: string }[]; bounties: { day: string; count: number }[] }
}

export interface AdminBounty extends Omit<BountySummary, 'summary'> {
  description: string | null
  acceptanceCriteria: string | null
  links: string[]
  contentHash: string
  metadataVerified: boolean
  moderationNote: string | null
  moderatedBy: string | null
  moderatedAt: string | null
  txHash: string | null
  creatorEmail: string | null
  creatorName: string | null
}

export interface AdminSubmission {
  id: string
  submitterWallet: string
  description: string | null
  pullRequestUrl: string | null
  notesVerified: boolean
  position: number | null
  txHash: string | null
  createdAt: string
  onchainId: number
  bountyTitle: string
  bountyStatus: Status
  submitterEmail: string | null
  submitterName: string | null
}

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  photoUrl: string | null
  createdAt: string
  lastSeenAt: string
  wallet: string | null
  bounties: number
  submissions: number
}

export interface AdminFee {
  id: string
  kind: 0 | 1
  amount: string
  payerWallet: string
  txHash: string
  time: string
  onchainId: number
  bountyTitle: string
}

export interface AdminActivity extends ActivityItem {
  moderationStatus: Moderation
}

export interface AuditEntry {
  id: string
  adminEmail: string
  action: string
  targetType: string
  targetId: string
  detail: Record<string, unknown>
  createdAt: string
}

export interface AdminSystem {
  network: { chainId: number; rpcUrl: string; explorerUrl: string }
  contract: string | null
  usdc: string
  treasury: string
  database: { latencyMs: number; poolTotal: number; poolIdle: number; poolWaiting: number }
  rpc: { latestBlock: number | null; latencyMs: number | null }
  indexer: {
    running: boolean
    holdsLock: boolean
    lastBlock: number | null
    latestBlock: number | null
    lastRunAt: string | null
    lastError: string | null
    lagBlocks: number | null
  }
  admins: string[]
}

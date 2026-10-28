/**
 * FixBounty - Backend PostgreSQL API Client
 * Connects frontend with the Express/PostgreSQL backend services.
 */

import { auth } from '@/firebase'

const API_BASE = '/api'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  try {
    const currentUser = auth?.currentUser
    if (currentUser) {
      const idToken = await currentUser.getIdToken(false)
      headers['Authorization'] = `Bearer ${idToken}`
    }
  } catch (err) {
    console.warn('[API] Failed to get Firebase ID token:', err)
  }

  return headers
}

export interface ApiUser {
  id: string
  firebaseUid: string
  email: string | null
  displayName: string | null
  photoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiWallet {
  id: string
  userId: string
  address: string
  chainId: number
  verified: boolean
  verificationMethod: string
  linkedAt: string
}

export interface ApiBounty {
  id: string
  onchainId: number | null
  creatorUserId: string | null
  creatorWallet: string
  title: string
  description: string
  acceptanceCriteria: string
  rewardAmount: string
  tokenSymbol: string
  tokenAddress: string
  deadline: string
  tags: string[]
  links: string[]
  txHash: string | null
  onchainStatus: number
  createdAt: string
  updatedAt: string
  creatorName?: string | null
  creatorPhoto?: string | null
}

export interface ApiSubmission {
  id: string
  bountyId: string
  onchainBountyId: number | null
  submitterUserId: string | null
  submitterWallet: string
  description: string
  pullRequestUrl: string
  attachments: string[]
  status: 'pending' | 'approved' | 'rejected'
  txHash: string | null
  createdAt: string
  updatedAt: string
  submitterName?: string | null
  submitterPhoto?: string | null
}

export interface ApiActivity {
  id: string
  bountyId: string | null
  onchainId: number | null
  actorWallet: string | null
  action: string
  description: string
  txHash: string | null
  createdAt: string
  bountyTitle?: string
  bountyReward?: string
  bountyStatus?: number
  actorName?: string | null
  actorPhoto?: string | null
}

// ---------------------------------------------------------------------------
// Auth & Wallets
// ---------------------------------------------------------------------------

export async function apiGetMe(): Promise<{ user: ApiUser; wallets: ApiWallet[] } | null> {
  try {
    const headers = await getAuthHeaders()
    if (!headers['Authorization']) return null
    const res = await fetch(`${API_BASE}/auth/me`, { headers })
    if (!res.ok) return null
    const data = (await res.json()) as { user: ApiUser; wallets: ApiWallet[] }
    return data
  } catch (err) {
    console.warn('[API] apiGetMe failed:', err)
    return null
  }
}

export async function apiGetWalletChallenge(address: string): Promise<{
  address: string
  nonce: string
  challengeText: string
  expiresAt: string
}> {
  const res = await fetch(`${API_BASE}/auth/wallet-challenge?address=${address}`)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Failed to request challenge' }))) as { error?: string }
    throw new Error(err.error || 'Failed to request challenge')
  }
  const data = (await res.json()) as {
    address: string
    nonce: string
    challengeText: string
    expiresAt: string
  }
  return data
}

export async function apiLinkWallet(address: string, signature: string): Promise<{
  success: boolean
  wallet: ApiWallet
  message: string
}> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/auth/link-wallet`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ address, signature }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Failed to link wallet' }))) as { error?: string }
    throw new Error(err.error || 'Failed to link wallet')
  }
  const data = (await res.json()) as {
    success: boolean
    wallet: ApiWallet
    message: string
  }
  return data
}

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

export async function apiGetBounties(params?: {
  status?: number
  search?: string
  limit?: number
  offset?: number
}): Promise<ApiBounty[]> {
  try {
    const q = new URLSearchParams()
    if (params?.status !== undefined) q.set('status', String(params.status))
    if (params?.search) q.set('search', params.search)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))

    const res = await fetch(`${API_BASE}/bounties?${q.toString()}`)
    if (!res.ok) return []
    const data = (await res.json()) as { bounties: ApiBounty[] }
    return data.bounties || []
  } catch (err) {
    console.warn('[API] apiGetBounties failed:', err)
    return []
  }
}

export async function apiGetBounty(id: string | number): Promise<ApiBounty | null> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/bounties/${id}`, { headers })
    if (!res.ok) return null
    const data = (await res.json()) as { bounty: ApiBounty }
    return data.bounty || null
  } catch (err) {
    console.warn(`[API] apiGetBounty(${id}) failed:`, err)
    return null
  }
}

export async function apiGetCreatorBounties(identifier: string): Promise<ApiBounty[]> {
  try {
    const res = await fetch(`${API_BASE}/bounties/creator/${identifier}`)
    if (!res.ok) return []
    const data = (await res.json()) as { bounties: ApiBounty[] }
    return data.bounties || []
  } catch (err) {
    console.warn(`[API] apiGetCreatorBounties(${identifier}) failed:`, err)
    return []
  }
}

export async function apiSaveBounty(data: {
  onchainId?: number
  creatorWallet: string
  title: string
  description: string
  acceptanceCriteria: string
  rewardAmount: string
  deadline: string
  tags?: string[]
  links?: string[]
  txHash?: string
}): Promise<ApiBounty> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/bounties`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Failed to save bounty' }))) as { error?: string }
    throw new Error(err.error || 'Failed to save bounty')
  }
  const result = (await res.json()) as { bounty: ApiBounty }
  return result.bounty
}

export async function apiUpdateBounty(
  id: string | number,
  data: {
    title?: string
    description?: string
    acceptanceCriteria?: string
    tags?: string[]
    links?: string[]
  }
): Promise<ApiBounty> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/bounties/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Failed to update bounty' }))) as { error?: string }
    throw new Error(err.error || 'Failed to update bounty')
  }
  const result = (await res.json()) as { bounty: ApiBounty }
  return result.bounty
}

export async function apiSyncBountyOnchain(id: string | number): Promise<void> {
  try {
    await fetch(`${API_BASE}/bounties/${id}/sync`, { method: 'POST' })
  } catch {
    // Background sync
  }
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export async function apiGetBountySubmissions(id: string | number): Promise<{
  submissions: ApiSubmission[]
  isCreator: boolean
}> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/bounties/${id}/submissions`, { headers })
    if (!res.ok) return { submissions: [], isCreator: false }
    const data = (await res.json()) as { submissions: ApiSubmission[]; isCreator: boolean }
    return data
  } catch (err) {
    console.warn(`[API] apiGetBountySubmissions(${id}) failed:`, err)
    return { submissions: [], isCreator: false }
  }
}

export async function apiCreateSubmission(
  bountyId: string | number,
  data: {
    submitterWallet: string
    description: string
    pullRequestUrl: string
    attachments?: string[]
    txHash?: string
  }
): Promise<ApiSubmission> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/bounties/${bountyId}/submissions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Failed to submit work' }))) as { error?: string }
    throw new Error(err.error || 'Failed to submit work')
  }
  const result = (await res.json()) as { submission: ApiSubmission }
  return result.submission
}

export async function apiGetContributorSubmissions(
  identifier: string
): Promise<ApiSubmission[]> {
  try {
    const res = await fetch(`${API_BASE}/submissions/contributor/${identifier}`)
    if (!res.ok) return []
    const data = (await res.json()) as { submissions: ApiSubmission[] }
    return data.submissions || []
  } catch (err) {
    console.warn(`[API] apiGetContributorSubmissions(${identifier}) failed:`, err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export interface ApiActivityResponse {
  activity: ApiActivity[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export async function apiGetActivity(
  paramsOrLimit?: number | {
    actor?: string
    bountyId?: string | number
    limit?: number
    offset?: number
  }
): Promise<ApiActivityResponse> {
  try {
    const q = new URLSearchParams()
    if (typeof paramsOrLimit === 'number') {
      q.set('limit', String(paramsOrLimit))
    } else if (paramsOrLimit) {
      if (paramsOrLimit.limit !== undefined) q.set('limit', String(paramsOrLimit.limit))
      if (paramsOrLimit.offset !== undefined) q.set('offset', String(paramsOrLimit.offset))
      if (paramsOrLimit.actor) q.set('actor', paramsOrLimit.actor)
      if (paramsOrLimit.bountyId) q.set('bountyId', String(paramsOrLimit.bountyId))
    }

    const res = await fetch(`${API_BASE}/activity?${q.toString()}`)
    if (!res.ok) return { activity: [], total: 0, limit: 30, offset: 0, hasMore: false }
    const data = (await res.json()) as {
      activity: ApiActivity[]
      total?: number
      limit?: number
      offset?: number
      hasMore?: boolean
    }
    return {
      activity: data.activity || [],
      total: data.total || data.activity?.length || 0,
      limit: data.limit || 30,
      offset: data.offset || 0,
      hasMore: !!data.hasMore,
    }
  } catch (err) {
    console.warn('[API] apiGetActivity failed:', err)
    return { activity: [], total: 0, limit: 30, offset: 0, hasMore: false }
  }
}

export async function apiRecordActivity(data: {
  onchainId: number
  action: 'funded' | 'approved' | 'claimed' | 'refunded' | 'cancelled' | 'metadata_updated' | 'submitted'
  actorWallet?: string
  description: string
  txHash?: string
}): Promise<void> {
  try {
    const headers = await getAuthHeaders()
    await fetch(`${API_BASE}/activity`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })
  } catch (err) {
    console.warn('[API] apiRecordActivity failed:', err)
  }
}

// =============================================================================
// Admin Panel API Client Functions
// =============================================================================

export interface ApiAdminStats {
  bounties: {
    total: number
    totalRewards: string
    open: number
    funded: number
    approved: number
    claimed: number
    refunded: number
    cancelled: number
  }
  submissions: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  users: {
    total: number
    uniqueCreators: number
    uniqueSubmitters: number
  }
  system: {
    network: string
    contractAddress: string
    usdcAddress: string
    rpcUrl: string
  }
}

export interface ApiAdminSubmission extends ApiSubmission {
  onchainId?: number | null
  bountyTitle: string
  bountyReward: string
  bountyStatus: number
  bountyCreatorWallet: string
  submitterEmail?: string | null
  submitterDisplayName?: string | null
}

export interface ApiAdminBounty extends ApiBounty {
  creatorEmail?: string | null
  creatorDisplayName?: string | null
  submissionsCount?: number
}

async function getAdminHeaders(adminKey?: string): Promise<Record<string, string>> {
  const headers = await getAuthHeaders()
  const key = adminKey || sessionStorage.getItem('fixbounty_admin_key') || (import.meta as { env?: { VITE_ADMIN_PASSWORD?: string } }).env?.VITE_ADMIN_PASSWORD
  if (key) {
    headers['x-admin-key'] = key
  }
  return headers
}

export async function apiVerifyAdmin(password?: string): Promise<{ valid: boolean; authMethod?: string; error?: string }> {
  try {
    const headers = await getAuthHeaders()
    if (password) headers['x-admin-key'] = password

    const res = await fetch(`${API_BASE}/admin/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password }),
    })
    const data = (await res.json()) as { valid: boolean; authMethod?: string; error?: string }
    return data
  } catch (err) {
    return { valid: false, error: (err as Error).message }
  }
}

export async function apiGetAdminStats(adminKey?: string): Promise<ApiAdminStats | null> {
  try {
    const headers = await getAdminHeaders(adminKey)
    const res = await fetch(`${API_BASE}/admin/stats`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data as ApiAdminStats
  } catch (err) {
    console.warn('[API] apiGetAdminStats failed:', err)
    return null
  }
}

export async function apiGetAdminBounties(
  params: { limit?: number; offset?: number; status?: string | number; search?: string },
  adminKey?: string
): Promise<{ bounties: ApiAdminBounty[]; total: number; limit: number; offset: number }> {
  try {
    const q = new URLSearchParams()
    if (params.limit !== undefined) q.set('limit', String(params.limit))
    if (params.offset !== undefined) q.set('offset', String(params.offset))
    if (params.status !== undefined && params.status !== 'all') q.set('status', String(params.status))
    if (params.search) q.set('search', params.search)

    const headers = await getAdminHeaders(adminKey)
    const res = await fetch(`${API_BASE}/admin/bounties?${q.toString()}`, { headers })
    if (!res.ok) return { bounties: [], total: 0, limit: params.limit || 20, offset: params.offset || 0 }
    return (await res.json()) as { bounties: ApiAdminBounty[]; total: number; limit: number; offset: number }
  } catch (err) {
    console.warn('[API] apiGetAdminBounties failed:', err)
    return { bounties: [], total: 0, limit: params.limit || 20, offset: params.offset || 0 }
  }
}

export async function apiGetAdminSubmissions(
  params: { limit?: number; offset?: number; status?: string; search?: string },
  adminKey?: string
): Promise<{ submissions: ApiAdminSubmission[]; total: number; limit: number; offset: number }> {
  try {
    const q = new URLSearchParams()
    if (params.limit !== undefined) q.set('limit', String(params.limit))
    if (params.offset !== undefined) q.set('offset', String(params.offset))
    if (params.status && params.status !== 'all') q.set('status', params.status)
    if (params.search) q.set('search', params.search)

    const headers = await getAdminHeaders(adminKey)
    const res = await fetch(`${API_BASE}/admin/submissions?${q.toString()}`, { headers })
    if (!res.ok) return { submissions: [], total: 0, limit: params.limit || 20, offset: params.offset || 0 }
    return (await res.json()) as { submissions: ApiAdminSubmission[]; total: number; limit: number; offset: number }
  } catch (err) {
    console.warn('[API] apiGetAdminSubmissions failed:', err)
    return { submissions: [], total: 0, limit: params.limit || 20, offset: params.offset || 0 }
  }
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, post, toQuery } from './client'
import type {
  ActivityItem,
  AdminActivity,
  AdminBounty,
  AdminFee,
  AdminOverview,
  AdminSubmission,
  AdminSystem,
  AdminUser,
  AppConfig,
  AuditEntry,
  BountyDetail,
  BountySummary,
  Me,
  MyBounty,
  MySubmission,
  MySummary,
  Page,
  PublicStats,
  Submission,
} from './types'
import type { ListingInput } from './ecosystem'
import { useAuth } from '@/contexts/AuthContext'

type ListPage<T> = Page<T>

export interface BountyFilters {
  search?: string
  /** Comma separated on-chain statuses. */
  status?: string
  open?: boolean
  sort?: 'newest' | 'reward' | 'deadline' | 'popular'
  creator?: string
  /** Marketplace state: open for work, in progress (review or claiming), completed, or cancelled/refunded. */
  state?: 'open' | 'in_progress' | 'completed' | 'cancelled'
  category?: string
  difficulty?: string
  project?: string
  mode?: 'solo' | 'team'
  skill?: string
  /** Whole USDC. */
  minReward?: number
  maxReward?: number
  deadlineWithin?: number
  limit?: number
  offset?: number
}

export const keys = {
  config: ['config'] as const,
  stats: ['stats'] as const,
  bounties: (filters: BountyFilters) => ['bounties', filters] as const,
  bounty: (id: number) => ['bounty', id] as const,
  submissions: (id: number) => ['bounty', id, 'submissions'] as const,
  activity: (params: object) => ['activity', params] as const,
  me: ['me'] as const,
  mine: ['mine'] as const,
}

export function useAppConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: () => get<AppConfig>('/config', { auth: false }),
    staleTime: 5 * 60_000,
    retry: 2,
  })
}

export function usePublicStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: () => get<PublicStats>('/stats', { auth: false }),
    staleTime: 30_000,
  })
}

export function useBounties(filters: BountyFilters) {
  return useQuery({
    queryKey: keys.bounties(filters),
    queryFn: () =>
      get<ListPage<BountySummary>>(
        `/bounties${toQuery({ ...filters, open: filters.open ? 1 : undefined })}`,
        { auth: false },
      ),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
}

export function useBounty(onchainId: number | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.bounty(onchainId ?? 0), user?.uid ?? 'anon'],
    queryFn: () => get<{ bounty: BountyDetail }>(`/bounties/${onchainId}`).then((r) => r.bounty),
    enabled: onchainId !== undefined,
    staleTime: 5_000,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  })
}

export function useSubmissions(onchainId: number | undefined, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.submissions(onchainId ?? 0), user?.uid ?? 'anon'],
    queryFn: () => get<{ submissions: Submission[] }>(`/bounties/${onchainId}/submissions`).then((r) => r.submissions),
    enabled: onchainId !== undefined && enabled,
    staleTime: 5_000,
  })
}

export function useActivity(params: { limit?: number; offset?: number; wallet?: string; bountyId?: number }) {
  return useQuery({
    queryKey: keys.activity(params),
    queryFn: () => get<ListPage<ActivityItem>>(`/activity${toQuery(params)}`, { auth: false }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
}

// --- account --------------------------------------------------------------------

export function useMe() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.me, user?.uid ?? 'anon'],
    queryFn: () => get<Me>('/auth/me'),
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useMyBounties(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.mine, 'bounties'],
    queryFn: () => get<{ items: MyBounty[] }>('/me/bounties').then((r) => r.items),
    enabled,
    staleTime: 10_000,
  })
}

export function useMySubmissions(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.mine, 'submissions'],
    queryFn: () => get<{ items: MySubmission[] }>('/me/submissions').then((r) => r.items),
    enabled,
    staleTime: 10_000,
  })
}

export function useMySummary(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.mine, 'summary'],
    queryFn: () => get<MySummary>('/me/summary'),
    enabled,
    staleTime: 10_000,
  })
}

export function useWalletLink() {
  const qc = useQueryClient()
  return {
    challenge: (address: string) => post<{ message: string; expiresAt: string }>('/auth/wallet/challenge', { address }),
    link: async (address: string, signature: string) => {
      await post<{ wallet: string }>('/auth/wallet/link', { address, signature })
      await qc.invalidateQueries({ queryKey: keys.me })
      await qc.invalidateQueries({ queryKey: keys.mine })
    },
    unlink: async () => {
      await del('/auth/wallet')
      await qc.invalidateQueries({ queryKey: keys.me })
      await qc.invalidateQueries({ queryKey: keys.mine })
    },
  }
}

// --- writes -----------------------------------------------------------------------

export interface PublishBountyInput {
  onchainId: number
  title: string
  description: string
  acceptanceCriteria: string
  tags: string[]
  links: string[]
  txHash?: string
  /** Listing details. They are stored beside the bounty and are not part of the on-chain hash. */
  listing?: ListingInput
}

export function usePublishBounty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PublishBountyInput) => post<{ bounty: BountyDetail }>('/bounties', input).then((r) => r.bounty),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.mine })
    },
  })
}

export interface AttachNotesInput {
  onchainId: number
  description: string
  pullRequestUrl: string
  attachments: string[]
  txHash?: string
}

export function useAttachNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ onchainId, ...body }: AttachNotesInput) => post<{ ok: true }>(`/bounties/${onchainId}/submissions`, body),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: keys.submissions(vars.onchainId) })
      void qc.invalidateQueries({ queryKey: keys.mine })
    },
  })
}

/** Tells the server to re-read a bounty from the chain, then refreshes everything that shows it. */
export function useRefreshBounty() {
  const qc = useQueryClient()
  return async (onchainId: number) => {
    await post(`/bounties/${onchainId}/refresh`, {}, { auth: false }).catch(() => undefined)
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.bounty(onchainId) }),
      qc.invalidateQueries({ queryKey: keys.submissions(onchainId) }),
      qc.invalidateQueries({ queryKey: ['bounties'] }),
      qc.invalidateQueries({ queryKey: keys.mine }),
      qc.invalidateQueries({ queryKey: ['activity'] }),
      qc.invalidateQueries({ queryKey: keys.stats }),
    ])
  }
}

// --- admin ---------------------------------------------------------------------------

export function useAdminAccess() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['admin', 'me', user?.uid ?? 'anon'],
    queryFn: () => get<{ email: string }>('/admin/me'),
    enabled: Boolean(user),
    retry: false,
    staleTime: 60_000,
  })
}

function adminList<T>(name: string, path: string, params: Record<string, string | number | undefined>) {
  return {
    queryKey: ['admin', name, params],
    queryFn: () => get<ListPage<T>>(`/admin/${path}${toQuery(params)}`),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  }
}

export const useAdminOverview = () =>
  useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<AdminOverview>('/admin/overview'), staleTime: 10_000 })

export const useAdminBounties = (params: { moderation: string; status?: string; search?: string; limit: number; offset: number }) =>
  useQuery(adminList<AdminBounty>('bounties', 'bounties', params))

export const useAdminSubmissions = (params: { search?: string; limit: number; offset: number }) =>
  useQuery(adminList<AdminSubmission>('submissions', 'submissions', params))

export const useAdminUsers = (params: { search?: string; limit: number; offset: number }) =>
  useQuery(adminList<AdminUser>('users', 'users', params))

export const useAdminRevenue = (params: { kind?: string; limit: number; offset: number }) =>
  useQuery(adminList<AdminFee>('revenue', 'revenue', params))

export const useAdminActivity = (params: { limit: number; offset: number }) =>
  useQuery(adminList<AdminActivity>('activity', 'activity', params))

export const useAdminAudit = (params: { limit: number; offset: number }) =>
  useQuery(adminList<AuditEntry>('audit', 'audit', params))

export const useAdminSystem = () =>
  useQuery({ queryKey: ['admin', 'system'], queryFn: () => get<AdminSystem>('/admin/system'), refetchInterval: 15_000 })

export function useModerate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ onchainId, decision, note }: { onchainId: number; decision: 'approved' | 'rejected' | 'pending'; note?: string }) =>
      post(`/admin/bounties/${onchainId}/moderation`, { decision, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      void qc.invalidateQueries({ queryKey: ['bounties'] })
      void qc.invalidateQueries({ queryKey: ['bounty'] })
    },
  })
}

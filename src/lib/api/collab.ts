import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, post, toQuery } from './client'
import { useWrite } from './ecosystem'
import { useAuth } from '@/contexts/AuthContext'

// Applications, disputes, integrations and insights.

export interface Application {
  id: string
  wallet: string
  name: string | null
  photo: string | null
  message: string
  status: 'requested' | 'approved' | 'declined'
  decisionNote: string
  appliedAt: string
}

export type DisputeStatus = 'open' | 'upheld' | 'dismissed' | 'settled'
export type DisputeReason = 'rejected' | 'reclaimed' | 'no_decision'

export interface DisputeSummary {
  id: string
  reason: DisputeReason
  summary: string
  status: DisputeStatus
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
  onchainId: number
  bountyTitle: string
  submitterWallet: string
  creatorWallet: string
  commentCount: number
  role?: 'contributor' | 'creator'
}

export interface DisputeThread {
  dispute: DisputeSummary
  role: 'contributor' | 'creator' | 'mediator'
  comments: Array<{ id: string; body: string; links: string[]; authorRole: 'contributor' | 'creator' | 'mediator'; createdAt: string; authorWallet: string | null; authorName: string | null }>
}

export interface ProjectWebhook {
  id: string
  events: string[]
  lastDeliveryAt: string | null
  lastError: string | null
  createdAt: string
  host: string
}

export interface ProjectAnalytics {
  bounties: number
  funded: string
  submissions: number
  withSubmissions: number
  withWinners: number
  reclaimed: number
  distributed: string
  medianHoursToFirstSubmission: number | null
  medianDaysToPickWinners: number | null
  medianReviewHours: number | null
  reviewedSubmissions: number
  categories: Array<{ category: string; bounties: number; submissions: number; paid: string }>
  weekly: Array<{ week: string; submissions: number; paid: string }>
}

export interface LeaderboardEntry {
  wallet: string
  name: string | null
  photo: string | null
  earned: string
  claims: number
}

export function useApplications(onchainId: number | undefined, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['bounty', onchainId, 'applications', user?.uid ?? 'anon'],
    queryFn: () => get<{ accepting: boolean; items: Application[]; total: number }>(`/bounties/${onchainId}/applications`),
    enabled: onchainId !== undefined && enabled,
  })
}

export const useApply = () => useWrite(({ onchainId, message }: { onchainId: number; message: string }) => post(`/bounties/${onchainId}/applications`, { message }), [['bounty']])
export const useWithdrawApplication = () => useWrite(({ onchainId }: { onchainId: number }) => post(`/bounties/${onchainId}/applications/withdraw`, {}), [['bounty']])
export const useDecideApplication = () =>
  useWrite(
    ({ onchainId, id, decision, note }: { onchainId: number; id: string; decision: 'approve' | 'decline'; note?: string }) =>
      post(`/bounties/${onchainId}/applications/${id}`, { decision, note: note ?? '' }),
    [['bounty'], ['bounties']],
  )

export function useMyDisputes(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'disputes'], queryFn: () => get<{ items: DisputeSummary[] }>('/disputes/mine').then((r) => r.items), enabled, staleTime: 10_000 })
}

export function useDispute(id: string | undefined) {
  return useQuery({ queryKey: ['dispute', id], queryFn: () => get<DisputeThread>(`/disputes/${id}`), enabled: Boolean(id) })
}

export const useOpenDispute = () => useWrite(({ submissionId, summary }: { submissionId: string; summary: string }) => post<{ id: string }>('/disputes', { submissionId, summary }), [['dispute']])
export const useDisputeComment = () =>
  useWrite(
    ({ id, body, links, mediator }: { id: string; body: string; links?: string[]; mediator?: boolean }) =>
      post(mediator ? `/admin/disputes/${id}/comments` : `/disputes/${id}/comments`, { body, links: links ?? [] }),
    [['dispute']],
  )

export function useAdminDisputes(status?: DisputeStatus) {
  return useQuery({
    queryKey: ['admin', 'disputes', status ?? 'all'],
    queryFn: () => get<{ items: DisputeSummary[] }>(`/admin/disputes${toQuery({ status })}`).then((r) => r.items),
    staleTime: 5_000,
  })
}

export function useResolveDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: 'upheld' | 'dismissed' | 'settled'; note: string }) => post(`/admin/disputes/${id}/resolve`, { outcome, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      void qc.invalidateQueries({ queryKey: ['dispute'] })
    },
  })
}

export function useProjectWebhooks(slug: string | undefined) {
  return useQuery({
    queryKey: ['project', slug, 'webhooks'],
    queryFn: () => get<{ items: ProjectWebhook[]; events: string[] }>(`/projects/${slug}/webhooks`),
    enabled: Boolean(slug),
  })
}

export const useAddWebhook = () =>
  useWrite(({ slug, url, events }: { slug: string; url: string; events: string[] }) => post<{ id: string; testDelivered: boolean }>(`/projects/${slug}/webhooks`, { url, events }), [['project']])
export const useDeleteWebhook = () => useWrite(({ slug, id }: { slug: string; id: string }) => del(`/projects/${slug}/webhooks/${id}`), [['project']])

export function useProjectAnalytics(slug: string | undefined) {
  return useQuery({ queryKey: ['project', slug, 'analytics'], queryFn: () => get<ProjectAnalytics>(`/projects/${slug}/analytics`), enabled: Boolean(slug) })
}

export function useLeaderboard(params: { period?: 'all' | '30d' | '90d'; category?: string }) {
  return useQuery({
    queryKey: ['leaderboard', params],
    queryFn: () => get<{ items: LeaderboardEntry[]; period: string }>(`/leaderboard${toQuery({ ...params, period: params.period === 'all' ? undefined : params.period })}`, { auth: false }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

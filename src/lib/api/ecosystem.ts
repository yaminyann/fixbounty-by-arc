import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, post, toQuery } from './client'
import type { ActivityItem, Difficulty, Page, ReviewStatus, WorkMode } from './types'
import { useAuth } from '@/contexts/AuthContext'

// ----------------------------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------------------------

export interface Category {
  slug: string
  name: string
  description: string
  icon: string
  examples: string[]
  openCount: number
  totalCount: number
}

export interface ProjectCard {
  id: string
  slug: string
  name: string
  tagline: string
  logoUrl: string | null
  bountyCount: number
  openCount: number
  completedCount: number
  fundedAmount: string
  distributedAmount: string
  contributorCount: number
}

export interface Project extends ProjectCard {
  description: string
  websiteUrl: string | null
  githubUrl: string | null
  ownerWallet: string
  ownerName: string | null
  ownerPhoto: string | null
  status: 'active' | 'hidden'
  createdAt: string
}

export interface ProjectContributor {
  wallet: string
  name: string | null
  photo: string | null
  submissions: number
  wins: number
  active: boolean
  earned: string
  lastAt: string
}

export interface ProjectReward {
  id: string
  onchainId: number
  bountyTitle: string
  wallet: string
  position: number
  gross: string
  fee: string
  net: string
  txHash: string
  time: string
}

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

export interface RecurringProgram {
  id: string
  title: string
  description: string
  category: string | null
  cadence: Cadence
  rewardPerCycle: string
  active: boolean
  startedOn: string
  cycleCount: number
  lastCycleAt: string | null
  lastBountyId: number | null
  distributedAmount: string
  nextDue: string | null
}

export type MilestoneStatus = 'open' | 'in_review' | 'changes_requested' | 'approved'

export interface MilestoneSubmission {
  id: string
  submitterWallet: string
  submitterName: string | null
  submitterPhoto?: string | null
  description?: string
  links?: string[]
  reviewStatus: ReviewStatus
  createdAt?: string
  commentCount?: number
  approved: boolean
}

export interface Milestone {
  id: string
  position: number
  title: string
  description: string
  rewardAmount: string
  approvedAt: string | null
  status: MilestoneStatus
  submissionCount: number
  submissions: MilestoneSubmission[]
}

export interface MilestonesResponse {
  items: Milestone[]
  plannedTotal: string
  rewardAmount: string
  editable: boolean
}

export interface TeamMember {
  id: string
  wallet: string
  name: string | null
  photo: string | null
  role: string
  responsibility: string
  shareBps: number | null
  status: 'requested' | 'active' | 'declined' | 'left'
  message: string
  joinedAt: string
}

export interface TeamState {
  workMode: WorkMode
  members: TeamMember[]
  requests: TeamMember[]
  mine: { status: TeamMember['status'] } | null
  assignedBps: number
  progress: { milestonesTotal: number; milestonesApproved: number; submissions: number }
}

export type ReviewTargetType = 'submission' | 'milestone_submission'
export type ReviewKind = 'comment' | 'revision_request' | 'approved' | 'rejected' | 'update' | 'reopened'

export interface ReviewComment {
  id: string
  kind: ReviewKind
  body: string
  links: string[]
  createdAt: string
  authorRole: 'reviewer' | 'contributor'
  authorWallet: string
  authorName: string | null
  authorPhoto: string | null
}

export interface ReviewThread {
  target: {
    type: ReviewTargetType
    id: string
    reviewStatus: ReviewStatus
    bountyOnchainId: number
    bountyTitle: string
    bountyStatus: number
    milestoneTitle: string | null
    submitterWallet: string
    ready: boolean
  }
  role: 'reviewer' | 'contributor' | 'admin'
  comments: ReviewComment[]
}

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string
  link: string
  readAt: string | null
  createdAt: string
}

export interface PublicProfile {
  wallet: string
  linked: boolean
  profile: {
    name: string | null
    photo: string | null
    bio: string | null
    skills: string[]
    websiteUrl: string | null
    githubUrl: string | null
    memberSince: string | null
  }
  stats: { submitted: number; won: number; bountiesPosted: number; earned: string; claims: number; milestonesApproved: number }
  contributions: Array<{
    onchainId: number
    title: string
    category: string | null
    position: number | null
    status: number
    claimed: boolean
    submittedAt: string
    projectSlug: string | null
    projectName: string | null
  }>
  milestones: Array<{ id: string; title: string; plannedReward: string; approvedAt: string; onchainId: number; bountyTitle: string }>
  claims: Array<{ onchainId: number; bountyTitle: string; position: number; gross: string; net: string; txHash: string; time: string }>
  projects: Array<{ slug: string; name: string; logoUrl: string | null; role: 'owner' | 'contributor' }>
  achievements: Array<{ kind: string; title: string; detail: string; source: 'chain' | 'platform'; txHash?: string; at?: string }>
}

export interface MyProfile {
  displayName: string | null
  bio: string | null
  skills: string[]
  websiteUrl: string | null
  githubUrl: string | null
  avatarUrl: string | null
}

export interface OwnerWorkspace {
  projects: number
  total: number
  awaitingApproval: number
  unfunded: number
  open: number
  inReview: number
  completed: number
  funded: string
  escrowed: string
  distributed: string
  submissionsToReview: number
  milestonesToReview: number
  waitingOnContributors: number
  teamRequests: number
  activeContributors: number
  recent: ActivityItem[]
}

export interface ContributorWorkspace {
  active: number
  pendingReview: number
  changesRequested: number
  completed: number
  won: number
  milestonesApproved: number
  earned: string
  available: number
  claimable: Array<{ onchainId: number; title: string; position: number; gross: string; approvedAt: string }>
  recent: ActivityItem[]
}

export interface Workspace {
  owner: OwnerWorkspace
  contributor: ContributorWorkspace
}

export interface MyProject {
  id: string
  slug: string
  name: string
  tagline: string
  logoUrl: string | null
  status: 'active' | 'hidden'
  createdAt: string
  role: ProjectRoleName
  bountyCount: number
  openCount: number
  programCount: number
  toReview: number
}

export interface ReviewQueueItem {
  id: string
  type: ReviewTargetType
  onchainId: number
  bountyTitle: string
  milestoneTitle: string | null
  submitterWallet: string
  submitterName: string | null
  reviewStatus: ReviewStatus
  ready: boolean
  createdAt: string
  updatedAt: string
  description: string | null
  link: string | null
  bountyStatus: number
  position: number | null
  commentCount: number
}

export interface MyMilestoneSubmission {
  id: string
  reviewStatus: ReviewStatus
  createdAt: string
  description: string
  links: string[]
  milestoneId: string
  milestoneTitle: string
  plannedReward: string
  approved: boolean
  onchainId: number
  bountyTitle: string
  bountyStatus: number
  commentCount: number
}

export interface TeamsResponse {
  memberships: Array<{
    id: string
    status: 'active' | 'requested'
    role: string
    responsibility: string
    shareBps: number | null
    joinedAt: string
    onchainId: number
    bountyTitle: string
    bountyStatus: number
    deadline: string
    rewardAmount: string
    moderationStatus: string
    memberCount: number
    milestonesTotal: number
    milestonesApproved: number
  }>
  led: Array<{
    onchainId: number
    bountyTitle: string
    bountyStatus: number
    deadline: string
    rewardAmount: string
    memberCount: number
    requestCount: number
    milestonesTotal: number
    milestonesApproved: number
  }>
}

export interface RewardsResponse {
  received: Array<{ id: string; onchainId: number; bountyTitle: string; position: number; gross: string; fee: string; net: string; txHash: string; time: string }>
  claimable: Array<{ onchainId: number; bountyTitle: string; position: number; gross: string; approvedAt: string }>
  funded: Array<{ id: string; onchainId: number; bountyTitle: string; kind: 'funded' | 'refunded'; amount: string; fee: string; txHash: string; time: string }>
}

export interface AdminCategory extends Omit<Category, 'openCount' | 'totalCount'> {
  sortOrder: number
  active: boolean
  bountyCount: number
}

export interface AdminProject {
  id: string
  slug: string
  name: string
  status: 'active' | 'hidden'
  ownerWallet: string
  ownerEmail: string | null
  createdAt: string
  bountyCount: number
}

// ----------------------------------------------------------------------------------------------
// Public data
// ----------------------------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => get<{ items: Category[] }>('/categories', { auth: false }).then((r) => r.items),
    staleTime: 60_000,
  })
}

export function useProjects(params: { search?: string; sort?: 'newest' | 'active'; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => get<Page<ProjectCard>>(`/projects${toQuery(params)}`, { auth: false }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
}

export function useProject(slug: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['project', slug, user?.uid ?? 'anon'],
    queryFn: () => get<{ project: Project; isOwner: boolean; role: ProjectRoleName | null }>(`/projects/${slug}`),
    enabled: Boolean(slug),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  })
}

export function useProjectContributors(slug: string | undefined, params: { limit: number; offset: number }) {
  return useQuery({
    queryKey: ['project', slug, 'contributors', params],
    queryFn: () => get<Page<ProjectContributor>>(`/projects/${slug}/contributors${toQuery(params)}`),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  })
}

export function useProjectRewards(slug: string | undefined, params: { limit: number; offset: number }) {
  return useQuery({
    queryKey: ['project', slug, 'rewards', params],
    queryFn: () => get<Page<ProjectReward>>(`/projects/${slug}/rewards${toQuery(params)}`),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  })
}

export function useProjectActivity(slug: string | undefined, params: { limit: number; offset: number }) {
  return useQuery({
    queryKey: ['project', slug, 'activity', params],
    queryFn: () => get<Page<ActivityItem>>(`/projects/${slug}/activity${toQuery(params)}`),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  })
}

export function useRecurringPrograms(slug: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['project', slug, 'recurring', user?.uid ?? 'anon'],
    queryFn: () => get<{ items: RecurringProgram[] }>(`/projects/${slug}/recurring`).then((r) => r.items),
    enabled: Boolean(slug),
  })
}

export function usePublicProfile(wallet: string | undefined) {
  return useQuery({
    queryKey: ['profile', wallet?.toLowerCase()],
    queryFn: () => get<PublicProfile>(`/profiles/${wallet}`, { auth: false }),
    enabled: Boolean(wallet),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  })
}

export function useMilestones(onchainId: number | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['bounty', onchainId, 'milestones', user?.uid ?? 'anon'],
    queryFn: () => get<MilestonesResponse>(`/bounties/${onchainId}/milestones`),
    enabled: onchainId !== undefined,
  })
}

export function useTeam(onchainId: number | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['bounty', onchainId, 'team', user?.uid ?? 'anon'],
    queryFn: () => get<TeamState>(`/bounties/${onchainId}/team`),
    enabled: onchainId !== undefined,
  })
}

export function useReviewThread(type: ReviewTargetType | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ['review', type, id],
    queryFn: () => get<ReviewThread>(`/reviews/${type}/${id}`),
    enabled: Boolean(type && id),
  })
}

// ----------------------------------------------------------------------------------------------
// Signed-in data
// ----------------------------------------------------------------------------------------------

export function useWorkspace(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'workspace'], queryFn: () => get<Workspace>('/me/workspace'), enabled, staleTime: 10_000 })
}

export function useMyProjects(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'projects'], queryFn: () => get<{ items: MyProject[] }>('/me/projects').then((r) => r.items), enabled, staleTime: 10_000 })
}

export function useReviewQueue(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'review-queue'], queryFn: () => get<{ items: ReviewQueueItem[] }>('/me/review-queue').then((r) => r.items), enabled, staleTime: 5_000 })
}

export function useMyMilestoneSubmissions(enabled: boolean) {
  return useQuery({
    queryKey: ['mine', 'milestone-submissions'],
    queryFn: () => get<{ items: MyMilestoneSubmission[] }>('/me/milestone-submissions').then((r) => r.items),
    enabled,
    staleTime: 10_000,
  })
}

export function useMyTeams(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'teams'], queryFn: () => get<TeamsResponse>('/me/teams'), enabled, staleTime: 10_000 })
}

export function useMyRewards(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'rewards'], queryFn: () => get<RewardsResponse>('/me/rewards'), enabled, staleTime: 10_000 })
}

export function useMyProfile(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'profile'], queryFn: () => get<{ profile: MyProfile }>('/me/profile').then((r) => r.profile), enabled })
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['mine', 'notifications'],
    queryFn: () => get<{ items: AppNotification[]; unread: number }>('/me/notifications?limit=50'),
    enabled,
    staleTime: 10_000,
  })
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['mine', 'unread'],
    queryFn: () => get<{ unread: number }>('/me/notifications/unread-count').then((r) => r.unread),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

// ----------------------------------------------------------------------------------------------
// Writes
// ----------------------------------------------------------------------------------------------

/** Mutation that refreshes everything that can show the changed data. */
function useWrite<TInput, TOutput = unknown>(fn: (input: TInput) => Promise<TOutput>, invalidate: unknown[][] = []) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of [['mine'], ...invalidate]) void qc.invalidateQueries({ queryKey: key })
    },
  })
}

export interface ProjectInput {
  name: string
  tagline: string
  description: string
  websiteUrl: string
  githubUrl: string
  logoUrl: string
}

export const useCreateProject = () =>
  useWrite((input: ProjectInput & { slug: string }) => post<{ slug: string }>('/projects', input), [['projects']])

export const useUpdateProject = () =>
  useWrite(({ slug, ...input }: ProjectInput & { slug: string }) => post(`/projects/${slug}`, input), [['projects'], ['project']])

export interface ProgramInput {
  title: string
  description: string
  category: string | null
  cadence: Cadence
  rewardPerCycle: string
}

export const useCreateProgram = () =>
  useWrite(({ slug, ...input }: ProgramInput & { slug: string }) => post<{ id: string }>(`/projects/${slug}/recurring`, input), [['project']])

export const useUpdateProgram = () =>
  useWrite(({ id, ...input }: Partial<ProgramInput> & { id: string; active?: boolean }) => post(`/recurring/${id}`, input), [['project']])

export interface ListingInput {
  category: string | null
  difficulty: Difficulty | null
  skills: string[]
  workMode: WorkMode
  project: string | null
  recurringProgramId: string | null
  submissionInstructions: string | null
  eligibility: string | null
  confidential: boolean
}

export const useUpdateListing = () =>
  useWrite(({ onchainId, ...input }: ListingInput & { onchainId: number }) => post(`/bounties/${onchainId}/listing`, input), [['bounty'], ['bounties'], ['project']])

export interface MilestoneInput {
  title: string
  description: string
  rewardAmount: string
}

export const useSaveMilestone = () =>
  useWrite(
    ({ onchainId, id, ...input }: MilestoneInput & { onchainId: number; id?: string }) =>
      post(id ? `/bounties/${onchainId}/milestones/${id}` : `/bounties/${onchainId}/milestones`, input),
    [['bounty']],
  )

export const useDeleteMilestone = () =>
  useWrite(({ onchainId, id }: { onchainId: number; id: string }) => del(`/bounties/${onchainId}/milestones/${id}`), [['bounty']])

export const useSubmitMilestoneWork = () =>
  useWrite(
    ({ onchainId, id, ...input }: { onchainId: number; id: string; description: string; links: string[] }) =>
      post(`/bounties/${onchainId}/milestones/${id}/submissions`, input),
    [['bounty']],
  )

export const useJoinTeam = () => useWrite(({ onchainId, message }: { onchainId: number; message: string }) => post(`/bounties/${onchainId}/team/join`, { message }), [['bounty']])

export const useLeaveTeam = () => useWrite(({ onchainId }: { onchainId: number }) => post(`/bounties/${onchainId}/team/leave`, {}), [['bounty']])

export const useDecideTeamMember = () =>
  useWrite(
    ({ onchainId, memberId, ...input }: { onchainId: number; memberId: string; decision: 'accept' | 'decline' | 'remove'; role?: string; responsibility?: string; shareBps?: number | null }) =>
      post(`/bounties/${onchainId}/team/${memberId}`, input),
    [['bounty']],
  )

export const useReviewDecision = () =>
  useWrite(
    ({ type, id, ...input }: { type: ReviewTargetType; id: string; decision: ReviewStatus; note: string }) => post(`/reviews/${type}/${id}/decision`, input),
    [['review'], ['bounty']],
  )

export const useReviewComment = () =>
  useWrite(
    ({ type, id, ...input }: { type: ReviewTargetType; id: string; body: string; links: string[]; kind: 'comment' | 'update' }) => post(`/reviews/${type}/${id}/comments`, input),
    [['review'], ['bounty']],
  )

export const useSaveProfile = () =>
  useWrite((input: { displayName: string; bio: string; skills: string[]; websiteUrl: string; githubUrl: string; avatarUrl: string }) => post('/me/profile', input), [['profile']])

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ids?: string[]; all?: boolean }) => post('/me/notifications/read', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mine', 'notifications'] })
      void qc.invalidateQueries({ queryKey: ['mine', 'unread'] })
    },
  })
}

// ----------------------------------------------------------------------------------------------
// Admin
// ----------------------------------------------------------------------------------------------

export const useAdminCategories = () =>
  useQuery({ queryKey: ['admin', 'categories'], queryFn: () => get<{ items: AdminCategory[] }>('/admin/categories').then((r) => r.items) })

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { slug: string; name: string; description: string; icon: string; examples: string[]; sortOrder: number; active: boolean }) => post('/admin/categories', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      void qc.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export const useAdminProjects = (params: { limit: number; offset: number }) =>
  useQuery({ queryKey: ['admin', 'projects', params], queryFn: () => get<Page<AdminProject>>(`/admin/projects${toQuery(params)}`), placeholderData: keepPreviousData })

export function useSetProjectStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, status }: { slug: string; status: 'active' | 'hidden' }) => post(`/admin/projects/${slug}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// ----------------------------------------------------------------------------------------------
// Trust and teamwork
// ----------------------------------------------------------------------------------------------

export interface CreatorRecord {
  wallet: string
  funded: number
  fundedAmount: string
  receivedSubmissions: number
  pickedWinners: number
  reclaimedAfterSubmissions: number
  reclaimedWithoutSubmissions: number
  awaitingDecision: number
  open: number
  paidToWinners: string
  medianDaysToPickWinners: number | null
}

export interface EncryptionKeyRecord {
  publicJwk: JsonWebKey
  wrappedPrivate: string
  createdAt: string
}

export interface SavedSearch {
  id: string
  name: string
  filters: { q?: string; category?: string; difficulty?: string; mode?: string; skill?: string; project?: string; min?: number; max?: number }
  hasWebhook: boolean
  lastTriggeredAt: string | null
  lastError: string | null
  createdAt: string
}

export type ProjectRoleName = 'owner' | 'manager' | 'reviewer'

export interface ProjectMember {
  userId: string
  role: ProjectRoleName
  wallet: string
  name: string | null
  photo: string | null
  addedAt: string
}

export function useCreatorRecord(wallet: string | undefined) {
  return useQuery({
    queryKey: ['creator', wallet?.toLowerCase()],
    queryFn: () => get<CreatorRecord>(`/creators/${wallet}`, { auth: false }),
    enabled: Boolean(wallet),
    staleTime: 30_000,
  })
}

export function useEncryptionKey(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'encryption-key'], queryFn: () => get<{ key: EncryptionKeyRecord | null }>('/me/encryption-key').then((r) => r.key), enabled })
}

export const useSaveEncryptionKey = () => useWrite((input: { publicJwk: JsonWebKey; wrappedPrivate: string }) => post('/me/encryption-key', input))

export function useSavedSearches(enabled: boolean) {
  return useQuery({ queryKey: ['mine', 'saved-searches'], queryFn: () => get<{ items: SavedSearch[] }>('/me/saved-searches').then((r) => r.items), enabled })
}

export const useCreateSavedSearch = () => useWrite((input: { name: string; filters: SavedSearch['filters']; webhookUrl?: string }) => post('/me/saved-searches', input))

export const useDeleteSavedSearch = () => useWrite((id: string) => del(`/me/saved-searches/${id}`))

export const useCheckPr = () =>
  useWrite((id: string) => post<{ state: string; merged: boolean; author: string | null; title: string | null }>(`/submissions/${id}/check-pr`, {}), [['bounty']])

export function useProjectMembers(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['project', slug, 'members'],
    queryFn: () => get<{ items: ProjectMember[]; yourRole: ProjectRoleName }>(`/projects/${slug}/members`),
    enabled: Boolean(slug) && enabled,
  })
}

export const useAddMember = () =>
  useWrite(({ slug, ...input }: { slug: string; wallet: string; role: 'manager' | 'reviewer' }) => post(`/projects/${slug}/members`, input), [['project']])

export const useRemoveMember = () => useWrite(({ slug, userId }: { slug: string; userId: string }) => del(`/projects/${slug}/members/${userId}`), [['project']])

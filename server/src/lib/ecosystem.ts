import type { Request } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { query } from '../db.js'
import { getLinkedWallet, isAdminUser } from '../auth.js'
import { HttpError } from './http.js'
import type { Queryable } from '../services/bountySync.js'

/** Shared validation for the application-level (not hashed on-chain) parts of the platform. */

export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed')

export const optionalUrl = z
  .union([z.literal(''), httpUrl])
  .optional()
  .transform((v) => (v ? v : null))

export const skillTag = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9+#._ -]*$/, 'Skills may contain letters, numbers and + # . _ -')

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const
export const WORK_MODES = ['solo', 'team'] as const
export const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly'] as const
export const REVIEW_DECISIONS = ['changes_requested', 'approved', 'rejected', 'submitted'] as const

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
export const RESERVED_SLUGS = new Set(['new', 'mine', 'edit', 'admin', 'api'])

/** Details shown on listings. Stored beside the bounty, never part of the on-chain content hash. */
export const ListingSchema = z.object({
  category: z.string().trim().toLowerCase().max(40).nullish(),
  difficulty: z.enum(DIFFICULTIES).nullish(),
  skills: z.array(skillTag).max(8).default([]),
  workMode: z.enum(WORK_MODES).default('solo'),
  project: z.string().trim().toLowerCase().max(40).nullish(),
  recurringProgramId: z.string().uuid().nullish(),
  submissionInstructions: z.string().trim().max(2_000).nullish(),
  eligibility: z.string().trim().max(1_000).nullish(),
  confidential: z.boolean().default(false),
})
export type Listing = z.infer<typeof ListingSchema>

export interface BountyAccessRow {
  id: string
  onchain_id: number
  onchain_status: number
  creator_user_id: string | null
  creator_wallet: string
  reward_amount: string
  deadline: string
  moderation_status: string
  metadata_verified: boolean
  work_mode: string
  title: string
  project_id: string | null
}

export async function loadBountyAccess(onchainId: number, db: Queryable = { query }): Promise<BountyAccessRow> {
  const contract = config.chain.contractAddress
  if (!contract) throw new HttpError(503, 'Contract is not configured.')
  const res = await db.query<BountyAccessRow>(
    `SELECT id, onchain_id::int AS onchain_id, onchain_status, creator_user_id, creator_wallet, reward_amount::text AS reward_amount,
            deadline, moderation_status, metadata_verified, work_mode, title, project_id
       FROM bounties WHERE contract_address = $1 AND onchain_id = $2`,
    [contract, onchainId],
  )
  const row = res.rows[0]
  if (!row) throw new HttpError(404, 'Bounty not found')
  return row
}

export function isBountyCreator(req: Request, bounty: BountyAccessRow): boolean {
  if (!req.user) return false
  if (bounty.creator_user_id === req.user.id) return true
  return req.wallet !== undefined && req.wallet === bounty.creator_wallet
}

/** Public once approved; creators and admins can always see their own view. */
export async function canSeeBounty(req: Request, bounty: BountyAccessRow): Promise<boolean> {
  if (bounty.moderation_status === 'approved' && bounty.metadata_verified) return true
  if (!req.user) return false
  if (isAdminUser(req.user)) return true
  if (bounty.creator_user_id === req.user.id) return true
  const wallet = req.wallet ?? (await getLinkedWallet(req.user.id))
  return wallet !== null && wallet === bounty.creator_wallet
}

/**
 * Validates classification fields against the data they reference and returns the column values to store.
 * `ownerUserId` must own the project and the recurring program that the bounty is attached to.
 */
export async function resolveListing(
  listing: Listing,
  ownerUserId: string,
  db: Queryable = { query },
): Promise<{
  category: string | null
  difficulty: string | null
  skills: string[]
  workMode: string
  projectId: string | null
  recurringProgramId: string | null
  submissionInstructions: string | null
  eligibility: string | null
  confidential: boolean
}> {
  let category: string | null = null
  if (listing.category) {
    const found = await db.query('SELECT 1 FROM categories WHERE slug = $1 AND active', [listing.category])
    if (found.rowCount === 0) throw new HttpError(400, 'Unknown category')
    category = listing.category
  }

  let projectId: string | null = null
  if (listing.project) {
    const found = await db.query<{ id: string }>(
      `SELECT p.id FROM projects p
        WHERE p.slug = $1 AND (p.owner_user_id = $2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2 AND m.role = 'manager'))`,
      [listing.project, ownerUserId],
    )
    if (found.rowCount === 0) throw new HttpError(403, 'You can only attach a bounty to a project you own or manage.')
    projectId = found.rows[0].id
  }

  let recurringProgramId: string | null = null
  if (listing.recurringProgramId) {
    const found = await db.query<{ id: string; project_id: string }>(
      `SELECT r.id, r.project_id FROM recurring_programs r
        WHERE r.id = $1 AND (r.owner_user_id = $2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = r.project_id AND m.user_id = $2 AND m.role = 'manager'))`,
      [listing.recurringProgramId, ownerUserId],
    )
    if (found.rowCount === 0) throw new HttpError(403, 'That recurring program is not yours.')
    if (projectId !== null && found.rows[0].project_id !== projectId) throw new HttpError(400, 'The recurring program belongs to a different project.')
    recurringProgramId = found.rows[0].id
    projectId ??= found.rows[0].project_id
  }

  return {
    category,
    difficulty: listing.difficulty ?? null,
    skills: [...new Set(listing.skills)],
    workMode: listing.workMode,
    projectId,
    recurringProgramId,
    submissionInstructions: listing.submissionInstructions || null,
    eligibility: listing.eligibility || null,
    confidential: listing.confidential,
  }
}

/** Escapes LIKE wildcards in user text. */
export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export const WALLET_RE = /^0x[0-9a-fA-F]{40}$/

export type ProjectRole = 'owner' | 'manager' | 'reviewer'

/** The caller's role on a project: the owner, an invited manager or reviewer, or null. */
export async function projectRole(userId: string, projectId: string, db: Queryable = { query }): Promise<ProjectRole | null> {
  const res = await db.query<{ role: ProjectRole }>(
    `SELECT 'owner' AS role FROM projects WHERE id = $1 AND owner_user_id = $2
     UNION ALL
     SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2
     LIMIT 1`,
    [projectId, userId],
  )
  return res.rows[0]?.role ?? null
}

/** Owners and managers can edit a project, its programs and its members. */
export const canManageProject = (role: ProjectRole | null): boolean => role === 'owner' || role === 'manager'

/** Users who review submissions of a bounty: its creator plus everyone on the bounty's project. */
export async function reviewerUserIds(bountyRowId: string, db: Queryable = { query }): Promise<string[]> {
  const res = await db.query<{ id: string }>(
    `SELECT b.creator_user_id AS id FROM bounties b WHERE b.id = $1 AND b.creator_user_id IS NOT NULL
     UNION
     SELECT p.owner_user_id FROM bounties b JOIN projects p ON p.id = b.project_id WHERE b.id = $1 AND p.owner_user_id IS NOT NULL
     UNION
     SELECT m.user_id FROM bounties b JOIN project_members m ON m.project_id = b.project_id WHERE b.id = $1`,
    [bountyRowId],
  )
  return res.rows.map((r) => r.id)
}

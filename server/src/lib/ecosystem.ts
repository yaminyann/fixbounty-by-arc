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
}

export async function loadBountyAccess(onchainId: number, db: Queryable = { query }): Promise<BountyAccessRow> {
  const contract = config.chain.contractAddress
  if (!contract) throw new HttpError(503, 'Contract is not configured.')
  const res = await db.query<BountyAccessRow>(
    `SELECT id, onchain_id::int AS onchain_id, onchain_status, creator_user_id, creator_wallet, reward_amount::text AS reward_amount,
            deadline, moderation_status, metadata_verified, work_mode, title
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
}> {
  let category: string | null = null
  if (listing.category) {
    const found = await db.query('SELECT 1 FROM categories WHERE slug = $1 AND active', [listing.category])
    if (found.rowCount === 0) throw new HttpError(400, 'Unknown category')
    category = listing.category
  }

  let projectId: string | null = null
  if (listing.project) {
    const found = await db.query<{ id: string }>('SELECT id FROM projects WHERE slug = $1 AND owner_user_id = $2', [listing.project, ownerUserId])
    if (found.rowCount === 0) throw new HttpError(403, 'You can only attach a bounty to a project you own.')
    projectId = found.rows[0].id
  }

  let recurringProgramId: string | null = null
  if (listing.recurringProgramId) {
    const found = await db.query<{ id: string; project_id: string }>(
      'SELECT id, project_id FROM recurring_programs WHERE id = $1 AND owner_user_id = $2',
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
  }
}

/** Escapes LIKE wildcards in user text. */
export function likePattern(input: string): string {
  return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export const WALLET_RE = /^0x[0-9a-fA-F]{40}$/

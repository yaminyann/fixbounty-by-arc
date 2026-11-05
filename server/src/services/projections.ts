/** SQL column projections shared by the public, creator and admin APIs (camelCase JSON). */

export const BOUNTY_LIST_COLUMNS = `
  b.id,
  b.onchain_id::int AS "onchainId",
  b.title,
  LEFT(COALESCE(b.description, ''), 240) AS summary,
  b.creator_wallet AS "creatorWallet",
  b.reward_amount::text AS "rewardAmount",
  b.token_symbol AS "tokenSymbol",
  b.deadline,
  b.onchain_status AS status,
  b.tags,
  b.prize_shares AS "prizeShares",
  b.winner_slots AS "winnerSlots",
  b.winner_count AS "winnerCount",
  b.claimed_count AS "claimedCount",
  b.submission_count AS "submissionCount",
  b.moderation_status AS "moderationStatus",
  b.category,
  b.difficulty,
  b.skills,
  b.work_mode AS "workMode",
  (SELECT p.slug FROM projects p WHERE p.id = b.project_id) AS "projectSlug",
  (SELECT p.name FROM projects p WHERE p.id = b.project_id) AS "projectName",
  (SELECT COUNT(*)::int FROM bounty_milestones m WHERE m.bounty_id = b.id) AS "milestoneCount",
  b.created_at AS "createdAt"`

export const BOUNTY_DETAIL_COLUMNS = `
  ${BOUNTY_LIST_COLUMNS},
  b.description,
  b.acceptance_criteria AS "acceptanceCriteria",
  b.links,
  b.content_hash AS "contentHash",
  b.metadata_verified AS "metadataVerified",
  b.prize_payouts::text[] AS "prizePayouts",
  b.winners,
  b.winners_claimed AS "winnersClaimed",
  b.unclaimed_amount::text AS "unclaimedAmount",
  b.funded_at AS "fundedAt",
  b.approved_at AS "approvedAt",
  b.tx_hash AS "txHash",
  b.moderation_note AS "moderationNote",
  b.moderated_at AS "moderatedAt",
  b.chain_synced_at AS "syncedAt",
  b.submission_instructions AS "submissionInstructions",
  b.eligibility,
  b.recurring_program_id AS "recurringProgramId",
  (SELECT p.logo_url FROM projects p WHERE p.id = b.project_id) AS "projectLogo",
  b.creator_user_id AS "creatorUserId",
  cu.display_name AS "creatorName",
  cu.photo_url AS "creatorPhoto"`

export const BOUNTY_DETAIL_FROM = `
  FROM bounties b
  LEFT JOIN users cu ON cu.id = b.creator_user_id`

export const SUBMISSION_COLUMNS = `
  s.id,
  s.submitter_wallet AS "submitterWallet",
  s.description,
  s.pull_request_url AS "pullRequestUrl",
  s.attachments,
  s.notes_verified AS "notesVerified",
  s.position,
  s.tx_hash AS "txHash",
  s.created_at AS "createdAt",
  s.review_status AS "reviewStatus",
  (SELECT COUNT(*)::int FROM review_comments rc WHERE rc.target_type = 'submission' AND rc.target_id = s.id) AS "commentCount",
  su.display_name AS "submitterName",
  su.photo_url AS "submitterPhoto",
  CASE
    WHEN s.position IS NOT NULL THEN 'winner'
    WHEN b.onchain_status >= 2 AND b.winner_count > 0 THEN 'not_selected'
    ELSE 'pending'
  END AS status`

/** Public statuses: unfunded (0) and cancelled (5) bounties stay out of the default listing. */
export const DEFAULT_PUBLIC_STATUSES = [1, 2, 3, 4]

/**
 * Builds a prefix-matching tsquery from free text, or null when nothing searchable remains.
 * "dark mode flick" -> "dark:* & mode:* & flick:*"
 */
export function toTsQuery(input: string | undefined): string | null {
  if (!input) return null
  const tokens = input.toLowerCase().match(/[\p{L}\p{N}]+/gu)
  if (!tokens) return null
  return tokens
    .slice(0, 5)
    .map((t) => `${t.slice(0, 32)}:*`)
    .join(' & ')
}

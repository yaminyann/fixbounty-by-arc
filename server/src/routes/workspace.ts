import { Router, type Request, type Response } from 'express'
import { query } from '../db.js'
import { clampInt, route } from '../lib/http.js'

/** Dashboards and work queues for the signed-in user. Everything is computed from stored records and indexed chain events. */
/** Mounted inside the `/api/me` router, which already requires a Google session and a linked wallet. */
export const workspaceRouter = Router()

workspaceRouter.get(
  '/workspace',
  route(async (req: Request, res: Response) => {
    const wallet = req.wallet
    const userId = req.user!.id

    const [owner, ownerWork, ownerRecent, contributor, available, claimable, contributorRecent] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM projects WHERE owner_user_id = $2) AS projects,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE moderation_status = 'pending' AND metadata_verified)::int AS "awaitingApproval",
           COUNT(*) FILTER (WHERE onchain_status = 0)::int AS unfunded,
           COUNT(*) FILTER (WHERE onchain_status = 1 AND deadline > NOW())::int AS open,
           COUNT(*) FILTER (WHERE (onchain_status = 1 AND deadline <= NOW()) OR onchain_status = 2)::int AS "inReview",
           COUNT(*) FILTER (WHERE onchain_status = 3)::int AS completed,
           COALESCE(SUM(reward_amount) FILTER (WHERE onchain_status IN (1, 2, 3)), 0)::text AS funded,
           COALESCE(SUM(CASE WHEN onchain_status = 1 THEN reward_amount WHEN onchain_status = 2 THEN unclaimed_amount ELSE 0 END), 0)::text AS escrowed,
           (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a JOIN bounties b2 ON b2.id = a.bounty_id
             WHERE a.kind = 'claimed' AND b2.creator_wallet = $1) AS distributed
         FROM bounties WHERE creator_wallet = $1`,
        [wallet, userId],
      ),
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
             WHERE b.creator_wallet = $1 AND b.onchain_status IN (1, 2) AND s.notes_verified AND s.review_status = 'submitted') AS "submissionsToReview",
           (SELECT COUNT(*)::int FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id JOIN bounties b ON b.id = m.bounty_id
             WHERE b.creator_wallet = $1 AND b.onchain_status IN (1, 2) AND ms.review_status = 'submitted') AS "milestonesToReview",
           (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
             WHERE b.creator_wallet = $1 AND b.onchain_status IN (1, 2) AND s.review_status = 'changes_requested') AS "waitingOnContributors",
           (SELECT COUNT(*)::int FROM bounty_team_members t JOIN bounties b ON b.id = t.bounty_id
             WHERE b.creator_wallet = $1 AND t.status = 'requested') AS "teamRequests",
           (SELECT COUNT(DISTINCT s.submitter_wallet)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
             WHERE b.creator_wallet = $1 AND b.onchain_status IN (1, 2)) AS "activeContributors"`,
        [wallet],
      ),
      query(
        `SELECT a.id, a.onchain_id::int AS "onchainId", a.kind, a.actor_wallet AS "actorWallet", a.position, a.amount::text AS amount,
                a.fee::text AS fee, a.tx_hash AS "txHash", a.block_time AS time, b.title AS "bountyTitle"
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE b.creator_wallet = $1 ORDER BY a.block_time DESC, a.log_index DESC LIMIT 8`,
        [wallet],
      ),
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id WHERE s.submitter_wallet = $1 AND b.onchain_status IN (1, 2))
           + (SELECT COUNT(*)::int FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id JOIN bounties b ON b.id = m.bounty_id
               WHERE ms.submitter_wallet = $1 AND b.onchain_status IN (1, 2)) AS active,
           (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
             WHERE s.submitter_wallet = $1 AND b.onchain_status IN (1, 2) AND s.notes_verified AND s.review_status = 'submitted')
           + (SELECT COUNT(*)::int FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id JOIN bounties b ON b.id = m.bounty_id
               WHERE ms.submitter_wallet = $1 AND b.onchain_status IN (1, 2) AND ms.review_status = 'submitted') AS "pendingReview",
           (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
             WHERE s.submitter_wallet = $1 AND b.onchain_status IN (1, 2) AND s.review_status = 'changes_requested')
           + (SELECT COUNT(*)::int FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id JOIN bounties b ON b.id = m.bounty_id
               WHERE ms.submitter_wallet = $1 AND b.onchain_status IN (1, 2) AND ms.review_status = 'changes_requested') AS "changesRequested",
           (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
             WHERE s.submitter_wallet = $1 AND s.position IS NOT NULL AND COALESCE(b.winners_claimed[s.position], FALSE)) AS completed,
           (SELECT COUNT(*)::int FROM submissions s WHERE s.submitter_wallet = $1 AND s.position IS NOT NULL) AS won,
           (SELECT COUNT(*)::int FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id AND m.approved_submission_id = ms.id
             WHERE ms.submitter_wallet = $1) AS "milestonesApproved",
           (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a WHERE a.kind = 'claimed' AND a.actor_wallet = $1) AS earned`,
        [wallet],
      ),
      query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM bounties b
          WHERE b.moderation_status = 'approved' AND b.metadata_verified AND b.onchain_status = 1 AND b.deadline > NOW()
            AND b.creator_wallet <> $1 AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.bounty_id = b.id AND s.submitter_wallet = $1)`,
        [wallet],
      ),
      query(
        `SELECT b.onchain_id::int AS "onchainId", b.title, s.position, b.prize_payouts[s.position]::text AS gross, b.approved_at AS "approvedAt"
           FROM submissions s JOIN bounties b ON b.id = s.bounty_id
          WHERE s.submitter_wallet = $1 AND s.position IS NOT NULL AND b.onchain_status = 2 AND NOT COALESCE(b.winners_claimed[s.position], FALSE)
          ORDER BY b.approved_at ASC LIMIT 10`,
        [wallet],
      ),
      query(
        `SELECT a.id, a.onchain_id::int AS "onchainId", a.kind, a.actor_wallet AS "actorWallet", a.position, a.amount::text AS amount,
                a.fee::text AS fee, a.tx_hash AS "txHash", a.block_time AS time, b.title AS "bountyTitle"
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE a.actor_wallet = $1 AND a.kind IN ('submitted', 'winner', 'claimed') ORDER BY a.block_time DESC, a.log_index DESC LIMIT 8`,
        [wallet],
      ),
    ])

    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      owner: { ...owner.rows[0], ...ownerWork.rows[0], recent: ownerRecent.rows },
      contributor: { ...contributor.rows[0], available: available.rows[0].n, claimable: claimable.rows, recent: contributorRecent.rows },
    })
  }),
)

/** Projects the user owns, with the same public numbers their contribution board shows. */
workspaceRouter.get(
  '/projects',
  route(async (req: Request, res: Response) => {
    const rows = await query(
      `SELECT p.id, p.slug, p.name, p.tagline, p.logo_url AS "logoUrl", p.status, p.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id) AS "bountyCount",
              (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id AND b.onchain_status = 1 AND b.deadline > NOW() AND b.moderation_status = 'approved') AS "openCount",
              (SELECT COUNT(*)::int FROM recurring_programs r WHERE r.project_id = p.id AND r.active) AS "programCount",
              (SELECT COUNT(*)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
                WHERE b.project_id = p.id AND b.onchain_status IN (1, 2) AND s.notes_verified AND s.review_status = 'submitted') AS "toReview"
         FROM projects p WHERE p.owner_user_id = $1 ORDER BY p.created_at DESC`,
      [req.user!.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

/** Everything waiting for the creator's review: on-chain submissions and milestone submissions. */
workspaceRouter.get(
  '/review-queue',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 100, 1, 200)
    const subs = await query(
      `SELECT s.id, 'submission' AS type, b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", NULL::text AS "milestoneTitle",
              s.submitter_wallet AS "submitterWallet", COALESCE(cp.display_name, u.display_name) AS "submitterName",
              s.review_status AS "reviewStatus", s.notes_verified AS ready, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
              s.description, s.pull_request_url AS link, b.onchain_status AS "bountyStatus", s.position,
              (SELECT COUNT(*)::int FROM review_comments c WHERE c.target_type = 'submission' AND c.target_id = s.id) AS "commentCount"
         FROM submissions s JOIN bounties b ON b.id = s.bounty_id
         LEFT JOIN users u ON u.id = COALESCE(s.submitter_user_id, (SELECT user_id FROM wallets WHERE address = s.submitter_wallet))
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE b.creator_wallet = $1 AND s.notes_verified
        ORDER BY s.created_at DESC LIMIT $2`,
      [req.wallet, limit],
    )
    const milestones = await query(
      `SELECT ms.id, 'milestone_submission' AS type, b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", m.title AS "milestoneTitle",
              ms.submitter_wallet AS "submitterWallet", COALESCE(cp.display_name, u.display_name) AS "submitterName",
              ms.review_status AS "reviewStatus", TRUE AS ready, ms.created_at AS "createdAt", ms.updated_at AS "updatedAt",
              ms.description, NULL::text AS link, b.onchain_status AS "bountyStatus", NULL::smallint AS position,
              (SELECT COUNT(*)::int FROM review_comments c WHERE c.target_type = 'milestone_submission' AND c.target_id = ms.id) AS "commentCount"
         FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id JOIN bounties b ON b.id = m.bounty_id
         LEFT JOIN users u ON u.id = COALESCE(ms.submitter_user_id, (SELECT user_id FROM wallets WHERE address = ms.submitter_wallet))
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE b.creator_wallet = $1
        ORDER BY ms.created_at DESC LIMIT $2`,
      [req.wallet, limit],
    )
    const items = [...subs.rows, ...milestones.rows].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items })
  }),
)

/** The user's milestone submissions with their review state. */
workspaceRouter.get(
  '/milestone-submissions',
  route(async (req: Request, res: Response) => {
    const rows = await query(
      `SELECT ms.id, ms.review_status AS "reviewStatus", ms.created_at AS "createdAt", ms.description, ms.links,
              m.id AS "milestoneId", m.title AS "milestoneTitle", m.reward_amount::text AS "plannedReward",
              (m.approved_submission_id = ms.id) AS approved,
              b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus",
              (SELECT COUNT(*)::int FROM review_comments c WHERE c.target_type = 'milestone_submission' AND c.target_id = ms.id) AS "commentCount"
         FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id JOIN bounties b ON b.id = m.bounty_id
        WHERE ms.submitter_wallet = $1 ORDER BY ms.created_at DESC LIMIT 100`,
      [req.wallet],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows })
  }),
)

/** Teams the user belongs to or asked to join. */
workspaceRouter.get(
  '/teams',
  route(async (req: Request, res: Response) => {
    const rows = await query(
      `SELECT t.id, t.status, t.role, t.responsibility, t.share_bps AS "shareBps", t.created_at AS "joinedAt",
              b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus", b.deadline,
              b.reward_amount::text AS "rewardAmount", b.moderation_status AS "moderationStatus",
              (SELECT COUNT(*)::int FROM bounty_team_members x WHERE x.bounty_id = b.id AND x.status = 'active') AS "memberCount",
              (SELECT COUNT(*)::int FROM bounty_milestones m WHERE m.bounty_id = b.id) AS "milestonesTotal",
              (SELECT COUNT(*)::int FROM bounty_milestones m WHERE m.bounty_id = b.id AND m.approved_submission_id IS NOT NULL) AS "milestonesApproved"
         FROM bounty_team_members t JOIN bounties b ON b.id = t.bounty_id
        WHERE t.wallet = $1 AND t.status IN ('active', 'requested')
        ORDER BY t.created_at DESC`,
      [req.wallet],
    )
    const led = await query(
      `SELECT b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus", b.deadline, b.reward_amount::text AS "rewardAmount",
              (SELECT COUNT(*)::int FROM bounty_team_members x WHERE x.bounty_id = b.id AND x.status = 'active') AS "memberCount",
              (SELECT COUNT(*)::int FROM bounty_team_members x WHERE x.bounty_id = b.id AND x.status = 'requested') AS "requestCount",
              (SELECT COUNT(*)::int FROM bounty_milestones m WHERE m.bounty_id = b.id) AS "milestonesTotal",
              (SELECT COUNT(*)::int FROM bounty_milestones m WHERE m.bounty_id = b.id AND m.approved_submission_id IS NOT NULL) AS "milestonesApproved"
         FROM bounties b WHERE b.creator_wallet = $1 AND b.work_mode = 'team' ORDER BY b.created_at DESC`,
      [req.wallet],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ memberships: rows.rows, led: led.rows })
  }),
)

/** Reward history: what the user received, what is waiting to be claimed and what they put into escrow. */
workspaceRouter.get(
  '/rewards',
  route(async (req: Request, res: Response) => {
    const [received, claimable, paid] = await Promise.all([
      query(
        `SELECT a.id, a.onchain_id::int AS "onchainId", b.title AS "bountyTitle", a.position, a.amount::text AS gross,
                COALESCE(a.fee, 0)::text AS fee, (a.amount - COALESCE(a.fee, 0))::text AS net, a.tx_hash AS "txHash", a.block_time AS time
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE a.kind = 'claimed' AND a.actor_wallet = $1 ORDER BY a.block_time DESC, a.log_index DESC LIMIT 200`,
        [req.wallet],
      ),
      query(
        `SELECT b.onchain_id::int AS "onchainId", b.title AS "bountyTitle", s.position, b.prize_payouts[s.position]::text AS gross, b.approved_at AS "approvedAt"
           FROM submissions s JOIN bounties b ON b.id = s.bounty_id
          WHERE s.submitter_wallet = $1 AND s.position IS NOT NULL AND b.onchain_status = 2 AND NOT COALESCE(b.winners_claimed[s.position], FALSE)
          ORDER BY b.approved_at ASC`,
        [req.wallet],
      ),
      query(
        `SELECT a.id, a.onchain_id::int AS "onchainId", b.title AS "bountyTitle", a.kind, a.amount::text AS amount, COALESCE(a.fee, 0)::text AS fee,
                a.tx_hash AS "txHash", a.block_time AS time
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE a.kind IN ('funded', 'refunded') AND a.actor_wallet = $1 ORDER BY a.block_time DESC, a.log_index DESC LIMIT 200`,
        [req.wallet],
      ),
    ])
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ received: received.rows, claimable: claimable.rows, funded: paid.rows })
  }),
)

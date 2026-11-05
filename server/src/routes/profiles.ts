import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { HttpError, parse, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { WALLET_RE, optionalUrl, skillTag } from '../lib/ecosystem.js'

export const profilesRouter = Router()

const PUBLIC_BOUNTY = `b.moderation_status = 'approved' AND b.metadata_verified`

/**
 * Public contributor profile. Every number comes from approved bounties, indexed contract events or
 * recorded review decisions; nothing is scored or estimated. `source` marks what can be verified on-chain.
 */
profilesRouter.get(
  '/:wallet',
  route(async (req: Request, res: Response) => {
    const wallet = String(req.params.wallet).toLowerCase()
    if (!WALLET_RE.test(wallet)) throw new HttpError(400, 'Invalid wallet address')

    const identity = await query<{
      userId: string | null
      name: string | null
      photo: string | null
      bio: string | null
      skills: string[] | null
      websiteUrl: string | null
      githubUrl: string | null
      memberSince: string | null
    }>(
      `SELECT u.id AS "userId", COALESCE(cp.display_name, u.display_name) AS name, COALESCE(cp.avatar_url, u.photo_url) AS photo,
              cp.bio, cp.skills, cp.website_url AS "websiteUrl", cp.github_url AS "githubUrl", u.created_at AS "memberSince"
         FROM wallets w
         JOIN users u ON u.id = w.user_id
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE w.address = $1 AND w.verified`,
      [wallet],
    )

    const [work, posted, earned, claims, wins, milestones, projects, funded] = await Promise.all([
      query<{ submitted: number; won: number }>(
        `SELECT COUNT(*)::int AS submitted, COUNT(*) FILTER (WHERE s.position IS NOT NULL)::int AS won
           FROM submissions s JOIN bounties b ON b.id = s.bounty_id WHERE s.submitter_wallet = $1 AND ${PUBLIC_BOUNTY}`,
        [wallet],
      ),
      query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM bounties b WHERE b.creator_wallet = $1 AND ${PUBLIC_BOUNTY} AND b.onchain_status IN (1, 2, 3, 4)`, [wallet]),
      query<{ earned: string; claims: number }>(
        `SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text AS earned, COUNT(*)::int AS claims
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id WHERE a.kind = 'claimed' AND a.actor_wallet = $1 AND ${PUBLIC_BOUNTY}`,
        [wallet],
      ),
      query(
        `SELECT a.onchain_id::int AS "onchainId", b.title AS "bountyTitle", a.position, a.amount::text AS gross,
                (a.amount - COALESCE(a.fee, 0))::text AS net, a.tx_hash AS "txHash", a.block_time AS time
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE a.kind = 'claimed' AND a.actor_wallet = $1 AND ${PUBLIC_BOUNTY}
          ORDER BY a.block_time DESC LIMIT 20`,
        [wallet],
      ),
      query(
        `SELECT b.onchain_id::int AS "onchainId", b.title, b.category, s.position, b.onchain_status AS status,
                COALESCE(b.winners_claimed[s.position], FALSE) AS claimed, s.created_at AS "submittedAt",
                (SELECT p.slug FROM projects p WHERE p.id = b.project_id) AS "projectSlug",
                (SELECT p.name FROM projects p WHERE p.id = b.project_id) AS "projectName"
           FROM submissions s JOIN bounties b ON b.id = s.bounty_id
          WHERE s.submitter_wallet = $1 AND ${PUBLIC_BOUNTY}
          ORDER BY (s.position IS NULL), s.created_at DESC LIMIT 30`,
        [wallet],
      ),
      query(
        `SELECT m.id, m.title, m.reward_amount::text AS "plannedReward", m.approved_at AS "approvedAt", b.onchain_id::int AS "onchainId", b.title AS "bountyTitle"
           FROM milestone_submissions ms
           JOIN bounty_milestones m ON m.id = ms.milestone_id AND m.approved_submission_id = ms.id
           JOIN bounties b ON b.id = m.bounty_id
          WHERE ms.submitter_wallet = $1 AND ${PUBLIC_BOUNTY}
          ORDER BY m.approved_at DESC LIMIT 20`,
        [wallet],
      ),
      query(
        `SELECT slug, name, logo_url AS "logoUrl", MIN(role) AS role FROM (
           SELECT p.slug, p.name, p.logo_url, 'owner' AS role FROM projects p WHERE p.owner_wallet = $1 AND p.status = 'active'
           UNION ALL
           SELECT p.slug, p.name, p.logo_url, 'contributor' AS role
             FROM submissions s JOIN bounties b ON b.id = s.bounty_id JOIN projects p ON p.id = b.project_id
            WHERE s.submitter_wallet = $1 AND ${PUBLIC_BOUNTY} AND p.status = 'active'
           UNION ALL
           SELECT p.slug, p.name, p.logo_url, 'contributor' AS role
             FROM milestone_submissions ms JOIN bounty_milestones m ON m.id = ms.milestone_id
             JOIN bounties b ON b.id = m.bounty_id JOIN projects p ON p.id = b.project_id
            WHERE ms.submitter_wallet = $1 AND ${PUBLIC_BOUNTY} AND p.status = 'active'
         ) x GROUP BY slug, name, logo_url ORDER BY name LIMIT 30`,
        [wallet],
      ),
      query<{ at: string; txHash: string; onchainId: number }>(
        `SELECT a.block_time AS at, a.tx_hash AS "txHash", a.onchain_id::int AS "onchainId"
           FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
          WHERE a.kind = 'funded' AND a.actor_wallet = $1 AND ${PUBLIC_BOUNTY} ORDER BY a.block_time ASC LIMIT 1`,
        [wallet],
      ),
    ])

    const known = identity.rows[0] !== undefined
    const seen = (work.rows[0].submitted ?? 0) + (posted.rows[0].total ?? 0) + (earned.rows[0].claims ?? 0) > 0
    if (!known && !seen) throw new HttpError(404, 'No public activity for this wallet yet.')

    // Verified facts. Each one names its evidence and whether the contract or only BountyFi records it.
    const achievements: Array<{ kind: string; title: string; detail: string; source: 'chain' | 'platform'; txHash?: string; at?: string }> = []
    const firstClaim = claims.rows[claims.rows.length - 1] as { txHash: string; time: string; bountyTitle: string } | undefined
    if (firstClaim) {
      achievements.push({ kind: 'first_payout', title: 'Received a payout', detail: `First claimed prize: ${firstClaim.bountyTitle}`, source: 'chain', txHash: firstClaim.txHash, at: firstClaim.time })
    }
    if (work.rows[0].won >= 3) {
      achievements.push({ kind: 'wins_3', title: `Won ${work.rows[0].won} bounties`, detail: 'Selected as a winner by the bounty creator on-chain.', source: 'chain' })
    }
    if (funded.rows[0]) {
      achievements.push({ kind: 'funded', title: 'Funded a bounty', detail: 'Locked a prize in the contract.', source: 'chain', txHash: funded.rows[0].txHash, at: funded.rows[0].at })
    }
    if (milestones.rows.length > 0) {
      achievements.push({ kind: 'milestone', title: `${milestones.rows.length} ${milestones.rows.length === 1 ? 'milestone' : 'milestones'} approved`, detail: 'Approved by the bounty creator on BountyFi.', source: 'platform' })
    }

    const id = identity.rows[0]
    res.setHeader('Cache-Control', 'public, max-age=10')
    res.json({
      wallet,
      linked: known,
      profile: {
        name: id?.name ?? null,
        photo: id?.photo ?? null,
        bio: id?.bio ?? null,
        skills: id?.skills ?? [],
        websiteUrl: id?.websiteUrl ?? null,
        githubUrl: id?.githubUrl ?? null,
        memberSince: id?.memberSince ?? null,
      },
      stats: {
        submitted: work.rows[0].submitted,
        won: work.rows[0].won,
        bountiesPosted: posted.rows[0].total,
        earned: earned.rows[0].earned,
        claims: earned.rows[0].claims,
        milestonesApproved: milestones.rows.length,
      },
      contributions: wins.rows,
      milestones: milestones.rows,
      claims: claims.rows,
      projects: projects.rows,
      achievements,
    })
  }),
)

// ---------------------------------------------------------------------------
// The signed-in user's own profile fields
// ---------------------------------------------------------------------------

export const myProfileRouter = Router()
myProfileRouter.use(requireAuth)

myProfileRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const row = await query(
      `SELECT display_name AS "displayName", bio, skills, website_url AS "websiteUrl", github_url AS "githubUrl", avatar_url AS "avatarUrl",
            hide_from_leaderboard AS "hideFromLeaderboard"
         FROM contributor_profiles WHERE user_id = $1`,
      [req.user!.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ profile: row.rows[0] ?? { displayName: null, bio: null, skills: [], websiteUrl: null, githubUrl: null, avatarUrl: null, hideFromLeaderboard: false } })
  }),
)

const ProfileSchema = z.object({
  displayName: z.string().trim().max(60).default(''),
  bio: z.string().trim().max(500).default(''),
  skills: z.array(skillTag).max(12).default([]),
  websiteUrl: optionalUrl,
  githubUrl: optionalUrl,
  avatarUrl: optionalUrl,
  hideFromLeaderboard: z.boolean().default(false),
})

myProfileRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 20 }),
  route(async (req: Request, res: Response) => {
    const p = parse(ProfileSchema, req.body)
    await query(
      `INSERT INTO contributor_profiles (user_id, display_name, bio, skills, website_url, github_url, avatar_url, hide_from_leaderboard)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, bio = EXCLUDED.bio, skills = EXCLUDED.skills,
         website_url = EXCLUDED.website_url, github_url = EXCLUDED.github_url, avatar_url = EXCLUDED.avatar_url, hide_from_leaderboard = EXCLUDED.hide_from_leaderboard, updated_at = NOW()`,
      [req.user!.id, p.displayName, p.bio, [...new Set(p.skills)], p.websiteUrl, p.githubUrl, p.avatarUrl, p.hideFromLeaderboard],
    )
    res.json({ ok: true })
  }),
)

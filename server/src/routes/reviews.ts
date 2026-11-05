import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db.js'
import { isAdminUser, requireAuth, requireLinkedWallet, getLinkedWallet } from '../auth.js'
import { HttpError, isUuid, parse, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { REVIEW_DECISIONS, httpUrl, projectRole, reviewerUserIds } from '../lib/ecosystem.js'
import { notify } from '../services/notify.js'

/**
 * Review threads for submissions. The creator reviews, the contributor replies with updates.
 * Approving here is a recorded review decision. Money still moves only when the creator picks winners on-chain.
 */
export const reviewsRouter = Router()

type TargetType = 'submission' | 'milestone_submission'

interface Target {
  type: TargetType
  id: string
  bountyOnchainId: number
  bountyTitle: string
  bountyStatus: number
  creatorUserId: string | null
  creatorWallet: string
  projectId: string | null
  bountyRowId: string
  submitterUserId: string | null
  submitterWallet: string
  reviewStatus: string
  ready: boolean
  milestoneId: string | null
  milestoneTitle: string | null
}

function parseType(raw: unknown): TargetType {
  if (raw === 'submission' || raw === 'milestone_submission') return raw
  throw new HttpError(400, 'Unknown review target')
}

async function loadTarget(type: TargetType, id: string): Promise<Target> {
  if (!isUuid(id)) throw new HttpError(404, 'Submission not found')
  const sql =
    type === 'submission'
      ? `SELECT s.id, b.onchain_id::int AS "bountyOnchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus",
                b.creator_user_id AS "creatorUserId", b.creator_wallet AS "creatorWallet", b.project_id AS "projectId", b.id AS "bountyRowId",
                s.submitter_user_id AS "submitterUserId", s.submitter_wallet AS "submitterWallet",
                s.review_status AS "reviewStatus", s.notes_verified AS ready, NULL::uuid AS "milestoneId", NULL::text AS "milestoneTitle"
           FROM submissions s JOIN bounties b ON b.id = s.bounty_id WHERE s.id = $1`
      : `SELECT s.id, b.onchain_id::int AS "bountyOnchainId", b.title AS "bountyTitle", b.onchain_status AS "bountyStatus",
                b.creator_user_id AS "creatorUserId", b.creator_wallet AS "creatorWallet", b.project_id AS "projectId", b.id AS "bountyRowId",
                s.submitter_user_id AS "submitterUserId", s.submitter_wallet AS "submitterWallet",
                s.review_status AS "reviewStatus", TRUE AS ready, m.id AS "milestoneId", m.title AS "milestoneTitle"
           FROM milestone_submissions s JOIN bounty_milestones m ON m.id = s.milestone_id JOIN bounties b ON b.id = m.bounty_id WHERE s.id = $1`
  const res = await query<Omit<Target, 'type'>>(sql, [id])
  if (!res.rows[0]) throw new HttpError(404, 'Submission not found')
  return { type, ...res.rows[0] }
}

interface Viewer {
  role: 'reviewer' | 'contributor' | 'admin'
  userId: string
  wallet: string | null
}

async function viewerFor(req: Request, target: Target): Promise<Viewer> {
  const user = req.user!
  const wallet = await getLinkedWallet(user.id)
  if (target.creatorUserId === user.id || (wallet !== null && wallet === target.creatorWallet)) return { role: 'reviewer', userId: user.id, wallet }
  if (target.submitterUserId === user.id || (wallet !== null && wallet === target.submitterWallet)) return { role: 'contributor', userId: user.id, wallet }
  // Everyone on the bounty's project reviews on behalf of the creator (but never their own work, handled above).
  if (target.projectId && (await projectRole(user.id, target.projectId)) !== null) return { role: 'reviewer', userId: user.id, wallet }
  if (isAdminUser(user)) return { role: 'admin', userId: user.id, wallet }
  // Do not reveal that the submission exists to strangers.
  throw new HttpError(404, 'Submission not found')
}

function link(target: Target): string {
  return target.type === 'milestone_submission' ? `/bounty/${target.bountyOnchainId}?tab=milestones` : `/bounty/${target.bountyOnchainId}?tab=submissions`
}

async function submitterUser(target: Target): Promise<string | null> {
  if (target.submitterUserId) return target.submitterUserId
  const res = await query<{ user_id: string }>('SELECT user_id FROM wallets WHERE address = $1', [target.submitterWallet])
  return res.rows[0]?.user_id ?? null
}

reviewsRouter.use(requireAuth)

reviewsRouter.get(
  '/:type/:id',
  route(async (req: Request, res: Response) => {
    const target = await loadTarget(parseType(req.params.type), String(req.params.id))
    const viewer = await viewerFor(req, target)
    const comments = await query(
      `SELECT c.id, c.kind, c.body, c.links, c.created_at AS "createdAt", c.author_role AS "authorRole", c.author_wallet AS "authorWallet",
              COALESCE(cp.display_name, u.display_name) AS "authorName", COALESCE(cp.avatar_url, u.photo_url) AS "authorPhoto"
         FROM review_comments c
         LEFT JOIN users u ON u.id = c.author_user_id
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE c.target_type = $1 AND c.target_id = $2
        ORDER BY c.created_at ASC`,
      [target.type, target.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      target: {
        type: target.type,
        id: target.id,
        reviewStatus: target.reviewStatus,
        bountyOnchainId: target.bountyOnchainId,
        bountyTitle: target.bountyTitle,
        bountyStatus: target.bountyStatus,
        milestoneTitle: target.milestoneTitle,
        submitterWallet: target.submitterWallet,
        ready: target.ready,
      },
      role: viewer.role,
      comments: comments.rows,
    })
  }),
)

const CommentSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
  links: z.array(httpUrl).max(5).default([]),
  kind: z.enum(['comment', 'update']).default('comment'),
})

reviewsRouter.post(
  '/:type/:id/comments',
  rateLimit({ windowMs: 60_000, max: 40 }),
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const target = await loadTarget(parseType(req.params.type), String(req.params.id))
    const viewer = await viewerFor(req, target)
    if (viewer.role === 'admin') throw new HttpError(403, 'Admins can read review threads but not post in them.')
    const input = parse(CommentSchema, req.body)
    const isUpdate = input.kind === 'update'
    if (isUpdate && viewer.role !== 'contributor') throw new HttpError(403, 'Only the contributor can post an update.')
    if (isUpdate && ![1, 2].includes(target.bountyStatus)) throw new HttpError(409, 'This bounty is closed, so updates are no longer accepted.')

    const kind = isUpdate ? 'update' : 'comment'
    await withTransaction(async (db) => {
      await db.query(
        `INSERT INTO review_comments (target_type, target_id, author_user_id, author_wallet, author_role, kind, body, links)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [target.type, target.id, viewer.userId, viewer.wallet, viewer.role === 'reviewer' ? 'reviewer' : 'contributor', kind, input.body, [...new Set(input.links)]],
      )
      // An update after a revision request puts the submission back in the review queue.
      if (isUpdate && target.reviewStatus === 'changes_requested') {
        const table = target.type === 'submission' ? 'submissions' : 'milestone_submissions'
        await db.query(`UPDATE ${table} SET review_status = 'submitted', reviewed_at = NULL, updated_at = NOW() WHERE id = $1`, [target.id])
      }
    })

    if (viewer.role === 'reviewer') {
      await notify({
        userId: await submitterUser(target),
        kind: 'review_comment',
        title: `New comment on your submission`,
        body: target.bountyTitle,
        link: link(target),
      })
    } else {
      for (const reviewer of await reviewerUserIds(target.bountyRowId)) {
        await notify({
          userId: reviewer,
          kind: isUpdate ? 'submission_update' : 'review_comment',
          title: isUpdate ? 'A contributor updated their submission' : 'A contributor replied in a review',
          body: target.bountyTitle,
          link: link(target),
        })
      }
    }
    res.status(201).json({ ok: true })
  }),
)

const DecisionSchema = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  note: z.string().trim().max(2_000).default(''),
})

const DECISION_KIND = { changes_requested: 'revision_request', approved: 'approved', rejected: 'rejected', submitted: 'reopened' } as const
const DECISION_TITLE = {
  changes_requested: 'Changes requested on your submission',
  approved: 'Your submission was approved',
  rejected: 'Your submission was not accepted',
  submitted: 'Your submission was reopened for review',
} as const

reviewsRouter.post(
  '/:type/:id/decision',
  rateLimit({ windowMs: 60_000, max: 40 }),
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const target = await loadTarget(parseType(req.params.type), String(req.params.id))
    const viewer = await viewerFor(req, target)
    if (viewer.role !== 'reviewer') throw new HttpError(403, 'Only the bounty creator and members of its project can review submissions.')
    const { decision, note } = parse(DecisionSchema, req.body)
    if ((decision === 'changes_requested' || decision === 'rejected') && note.length < 3) {
      throw new HttpError(400, decision === 'rejected' ? 'Add a short reason so the contributor knows why.' : 'Say what needs to change.')
    }
    if (!target.ready) throw new HttpError(409, 'The contributor has not attached their notes yet.')
    if (![1, 2].includes(target.bountyStatus)) throw new HttpError(409, 'This bounty is closed, so reviews can no longer change.')
    if (target.reviewStatus === decision) throw new HttpError(409, 'The submission already has that status.')

    await withTransaction(async (db) => {
      const table = target.type === 'submission' ? 'submissions' : 'milestone_submissions'
      await db.query(`UPDATE ${table} SET review_status = $2, reviewed_at = NOW(), updated_at = NOW() WHERE id = $1`, [target.id, decision])

      if (target.type === 'milestone_submission' && target.milestoneId) {
        if (decision === 'approved') {
          const set = await db.query(
            `UPDATE bounty_milestones SET approved_submission_id = $2, approved_at = NOW(), updated_at = NOW()
              WHERE id = $1 AND approved_submission_id IS NULL`,
            [target.milestoneId, target.id],
          )
          if (set.rowCount === 0) throw new HttpError(409, 'Another submission was already approved for this milestone.')
        } else if (target.reviewStatus === 'approved') {
          await db.query(
            `UPDATE bounty_milestones SET approved_submission_id = NULL, approved_at = NULL, updated_at = NOW()
              WHERE id = $1 AND approved_submission_id = $2`,
            [target.milestoneId, target.id],
          )
        }
      }

      await db.query(
        `INSERT INTO review_comments (target_type, target_id, author_user_id, author_wallet, author_role, kind, body)
         VALUES ($1, $2, $3, $4, 'reviewer', $5, $6)`,
        [target.type, target.id, viewer.userId, viewer.wallet, DECISION_KIND[decision], note],
      )
    })

    await notify({
      userId: await submitterUser(target),
      kind: `review_${decision}`,
      title: DECISION_TITLE[decision],
      body: target.milestoneTitle ? `${target.bountyTitle}: ${target.milestoneTitle}` : target.bountyTitle,
      link: link(target),
    })
    res.json({ reviewStatus: decision })
  }),
)

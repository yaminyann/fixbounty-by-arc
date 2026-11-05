import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { isAdminUser, optionalAuth, requireAuth, requireLinkedWallet } from '../auth.js'
import { HttpError, clampInt, parse, queryString, route } from '../lib/http.js'
import { TtlCache, rateLimit } from '../lib/limits.js'
import { CADENCES, RESERVED_SLUGS, SLUG_RE, likePattern, optionalUrl } from '../lib/ecosystem.js'

export const projectsRouter = Router()
export const recurringRouter = Router()

const PUBLIC_BOUNTY = `b.moderation_status = 'approved' AND b.metadata_verified`
const listCache = new TtlCache<{ items: unknown[]; total: number }>(5_000)

const PROJECT_COLUMNS = `
  p.id, p.slug, p.name, p.tagline, p.description, p.website_url AS "websiteUrl", p.github_url AS "githubUrl",
  p.logo_url AS "logoUrl", p.owner_wallet AS "ownerWallet", p.status, p.created_at AS "createdAt",
  u.display_name AS "ownerName", u.photo_url AS "ownerPhoto"`

/** Numbers shown on cards and the contribution board. Everything is derived from approved bounties and indexed chain events. */
const PROJECT_STATS = `
  (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND b.onchain_status IN (1, 2, 3, 4)) AS "bountyCount",
  (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND b.onchain_status = 1 AND b.deadline > NOW()) AS "openCount",
  (SELECT COUNT(*)::int FROM bounties b WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND b.onchain_status = 3) AS "completedCount",
  (SELECT COALESCE(SUM(b.reward_amount), 0)::text FROM bounties b WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND b.onchain_status IN (1, 2, 3)) AS "fundedAmount",
  (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
    WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY} AND a.kind = 'claimed') AS "distributedAmount",
  (SELECT COUNT(DISTINCT s.submitter_wallet)::int FROM submissions s JOIN bounties b ON b.id = s.bounty_id
    WHERE b.project_id = p.id AND ${PUBLIC_BOUNTY}) AS "contributorCount"`

async function loadProject(slug: string, req: Request) {
  if (!SLUG_RE.test(slug)) throw new HttpError(404, 'Project not found')
  const res = await query<{ id: string; status: string; ownerWallet: string; owner_user_id: string | null }>(
    `SELECT ${PROJECT_COLUMNS}, p.owner_user_id, ${PROJECT_STATS}
       FROM projects p LEFT JOIN users u ON u.id = p.owner_user_id WHERE p.slug = $1`,
    [slug],
  )
  const project = res.rows[0]
  if (!project) throw new HttpError(404, 'Project not found')
  const isOwner = Boolean(req.user && project.owner_user_id === req.user.id)
  if (project.status !== 'active' && !isOwner && !isAdminUser(req.user)) throw new HttpError(404, 'Project not found')
  const { owner_user_id: _ignored, ...rest } = project
  return { project: rest, isOwner }
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

projectsRouter.get(
  '/',
  route(async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 12, 1, 50)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const search = queryString(req.query.search, 60)?.toLowerCase()
    const sort = queryString(req.query.sort, 12) === 'newest' ? '"createdAt" DESC' : '"openCount" DESC, "fundedAmount"::bigint DESC, "createdAt" DESC'

    const result = await listCache.get(JSON.stringify([limit, offset, search, sort]), async () => {
      const params: unknown[] = []
      let where = `p.status = 'active'`
      if (search) {
        params.push(likePattern(search))
        where += ` AND (LOWER(p.name) LIKE $1 OR LOWER(p.tagline) LIKE $1)`
      }
      params.push(limit, offset)
      const rows = await query<{ total: string }>(
        `SELECT * FROM (
           SELECT ${PROJECT_COLUMNS}, ${PROJECT_STATS}, COUNT(*) OVER()::text AS total
             FROM projects p LEFT JOIN users u ON u.id = p.owner_user_id WHERE ${where}
         ) p ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
      return { items: rows.rows.map(({ total: _t, ...rest }) => rest), total }
    })
    res.setHeader('Cache-Control', 'public, max-age=5')
    res.json({ ...result, limit, offset })
  }),
)

// ---------------------------------------------------------------------------
// One project
// ---------------------------------------------------------------------------

projectsRouter.get(
  '/:slug',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const { project, isOwner } = await loadProject(String(req.params.slug).toLowerCase(), req)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ project, isOwner })
  }),
)

projectsRouter.get(
  '/:slug/contributors',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const { project } = await loadProject(String(req.params.slug).toLowerCase(), req)
    const limit = clampInt(req.query.limit, 24, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const rows = await query<{ total: string }>(
      `SELECT * FROM (SELECT s.submitter_wallet AS wallet,
              MAX(COALESCE(cp.display_name, u.display_name)) AS name,
              MAX(COALESCE(cp.avatar_url, u.photo_url)) AS photo,
              COUNT(*)::int AS submissions,
              COUNT(*) FILTER (WHERE s.position IS NOT NULL)::int AS wins,
              BOOL_OR(b.onchain_status IN (1, 2)) AS active,
              COALESCE((SELECT SUM(a.amount - COALESCE(a.fee, 0)) FROM bounty_activity a JOIN bounties b2 ON b2.id = a.bounty_id
                         WHERE b2.project_id = $1 AND a.kind = 'claimed' AND a.actor_wallet = s.submitter_wallet), 0)::text AS earned,
              MAX(s.created_at) AS "lastAt",
              COUNT(*) OVER()::text AS total
         FROM submissions s
         JOIN bounties b ON b.id = s.bounty_id
         LEFT JOIN users u ON u.id = COALESCE(s.submitter_user_id, (SELECT user_id FROM wallets WHERE address = s.submitter_wallet))
         LEFT JOIN contributor_profiles cp ON cp.user_id = u.id
        WHERE b.project_id = $1 AND ${PUBLIC_BOUNTY}
        GROUP BY s.submitter_wallet) c
        ORDER BY c.earned::bigint DESC, c.wins DESC, c.submissions DESC, c."lastAt" DESC
        LIMIT $2 OFFSET $3`,
      [project.id, limit, offset],
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.setHeader('Cache-Control', 'public, max-age=5')
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

projectsRouter.get(
  '/:slug/rewards',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const { project } = await loadProject(String(req.params.slug).toLowerCase(), req)
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const rows = await query<{ total: string }>(
      `SELECT a.id, a.onchain_id::int AS "onchainId", b.title AS "bountyTitle", a.actor_wallet AS wallet, a.position,
              a.amount::text AS gross, COALESCE(a.fee, 0)::text AS fee, (a.amount - COALESCE(a.fee, 0))::text AS net,
              a.tx_hash AS "txHash", a.block_time AS time, COUNT(*) OVER()::text AS total
         FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
        WHERE b.project_id = $1 AND ${PUBLIC_BOUNTY} AND a.kind = 'claimed'
        ORDER BY a.block_time DESC, a.log_index DESC
        LIMIT $2 OFFSET $3`,
      [project.id, limit, offset],
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.setHeader('Cache-Control', 'public, max-age=5')
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

projectsRouter.get(
  '/:slug/activity',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const { project } = await loadProject(String(req.params.slug).toLowerCase(), req)
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const offset = clampInt(req.query.offset, 0, 0, 10_000)
    const rows = await query<{ total: string }>(
      `SELECT a.id, a.onchain_id::int AS "onchainId", a.kind, a.actor_wallet AS "actorWallet", a.position,
              a.amount::text AS amount, a.fee::text AS fee, a.tx_hash AS "txHash", a.block_time AS "time",
              b.title AS "bountyTitle", COUNT(*) OVER()::text AS total
         FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
        WHERE b.project_id = $1 AND ${PUBLIC_BOUNTY}
        ORDER BY a.block_time DESC, a.log_index DESC
        LIMIT $2 OFFSET $3`,
      [project.id, limit, offset],
    )
    const total = rows.rows[0] ? Number(rows.rows[0].total) : 0
    res.setHeader('Cache-Control', 'public, max-age=5')
    res.json({ items: rows.rows.map(({ total: _t, ...rest }) => rest), total, limit, offset })
  }),
)

const PROGRAM_COLUMNS = `
  r.id, r.title, r.description, r.category, r.cadence, r.reward_per_cycle::text AS "rewardPerCycle", r.active,
  r.started_on::text AS "startedOn", r.created_at AS "createdAt",
  (SELECT COUNT(*)::int FROM bounties b WHERE b.recurring_program_id = r.id) AS "cycleCount",
  (SELECT MAX(b.created_at) FROM bounties b WHERE b.recurring_program_id = r.id) AS "lastCycleAt",
  (SELECT b.onchain_id::int FROM bounties b WHERE b.recurring_program_id = r.id ORDER BY b.created_at DESC LIMIT 1) AS "lastBountyId",
  (SELECT COALESCE(SUM(a.amount - COALESCE(a.fee, 0)), 0)::text FROM bounty_activity a JOIN bounties b ON b.id = a.bounty_id
    WHERE b.recurring_program_id = r.id AND a.kind = 'claimed') AS "distributedAmount"`

/** Next due date: one cadence step after the latest cycle (or the start date when no cycle exists yet). */
function nextDue(cadence: string, lastCycleAt: string | null, startedOn: string): string {
  const from = lastCycleAt ? new Date(lastCycleAt) : new Date(`${startedOn.slice(0, 10)}T00:00:00Z`)
  if (!lastCycleAt) return from.toISOString()
  const next = new Date(from)
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  else if (cadence === 'biweekly') next.setUTCDate(next.getUTCDate() + 14)
  else if (cadence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 3)
  return next.toISOString()
}

projectsRouter.get(
  '/:slug/recurring',
  optionalAuth,
  route(async (req: Request, res: Response) => {
    const { project, isOwner } = await loadProject(String(req.params.slug).toLowerCase(), req)
    const rows = await query<{ cadence: string; lastCycleAt: string | null; startedOn: string; active: boolean }>(
      `SELECT ${PROGRAM_COLUMNS} FROM recurring_programs r WHERE r.project_id = $1 ${isOwner ? '' : 'AND r.active'} ORDER BY r.created_at DESC`,
      [project.id],
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ items: rows.rows.map((r) => ({ ...r, nextDue: r.active ? nextDue(r.cadence, r.lastCycleAt, r.startedOn) : null })) })
  }),
)

// ---------------------------------------------------------------------------
// Writes (owner only)
// ---------------------------------------------------------------------------

const ProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160).default(''),
  description: z.string().trim().max(5_000).default(''),
  websiteUrl: optionalUrl,
  githubUrl: optionalUrl,
  logoUrl: optionalUrl,
})

const CreateProjectSchema = ProjectSchema.extend({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, 'Use 3 to 40 letters, numbers or hyphens, starting and ending with a letter or number')
    .refine((s) => !RESERVED_SLUGS.has(s), 'That address is reserved'),
})

projectsRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 10 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const body = parse(CreateProjectSchema, req.body)
    const count = await query<{ n: number }>('SELECT COUNT(*)::int AS n FROM projects WHERE owner_user_id = $1', [req.user!.id])
    if (count.rows[0].n >= 20) throw new HttpError(409, 'You can own up to 20 projects.')
    try {
      await query(
        `INSERT INTO projects (slug, name, tagline, description, website_url, github_url, logo_url, owner_user_id, owner_wallet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [body.slug, body.name, body.tagline, body.description, body.websiteUrl, body.githubUrl, body.logoUrl, req.user!.id, req.wallet],
      )
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'That project address is already taken.')
      throw err
    }
    listCache.invalidate()
    res.status(201).json({ slug: body.slug })
  }),
)

projectsRouter.post(
  '/:slug',
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const slug = String(req.params.slug).toLowerCase()
    const body = parse(ProjectSchema, req.body)
    const updated = await query(
      `UPDATE projects SET name = $3, tagline = $4, description = $5, website_url = $6, github_url = $7, logo_url = $8, updated_at = NOW()
        WHERE slug = $1 AND owner_user_id = $2 RETURNING id`,
      [slug, req.user!.id, body.name, body.tagline, body.description, body.websiteUrl, body.githubUrl, body.logoUrl],
    )
    if (updated.rowCount === 0) throw new HttpError(403, 'Only the project owner can edit it.')
    listCache.invalidate()
    res.json({ ok: true })
  }),
)

const ProgramSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2_000).default(''),
  category: z.string().trim().toLowerCase().max(40).nullish(),
  cadence: z.enum(CADENCES),
  rewardPerCycle: z.string().regex(/^[1-9]\d{0,14}$/, 'Reward must be a positive amount in USDC base units'),
})

async function assertCategory(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null
  const found = await query('SELECT 1 FROM categories WHERE slug = $1 AND active', [slug])
  if (found.rowCount === 0) throw new HttpError(400, 'Unknown category')
  return slug
}

projectsRouter.post(
  '/:slug/recurring',
  rateLimit({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const body = parse(ProgramSchema, req.body)
    const project = await query<{ id: string }>('SELECT id FROM projects WHERE slug = $1 AND owner_user_id = $2', [String(req.params.slug).toLowerCase(), req.user!.id])
    if (project.rowCount === 0) throw new HttpError(403, 'Only the project owner can add recurring programs.')
    const category = await assertCategory(body.category)
    const created = await query<{ id: string }>(
      `INSERT INTO recurring_programs (project_id, owner_user_id, title, description, category, cadence, reward_per_cycle)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [project.rows[0].id, req.user!.id, body.title, body.description, category, body.cadence, body.rewardPerCycle],
    )
    res.status(201).json({ id: created.rows[0].id })
  }),
)

const ProgramUpdateSchema = ProgramSchema.partial().extend({ active: z.boolean().optional() })

recurringRouter.post(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAuth,
  requireLinkedWallet,
  route(async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Invalid program id')
    const body = parse(ProgramUpdateSchema, req.body)
    const category = body.category === undefined ? undefined : await assertCategory(body.category)
    const updated = await query(
      `UPDATE recurring_programs SET
          title = COALESCE($3, title), description = COALESCE($4, description), category = CASE WHEN $5::boolean THEN $6 ELSE category END,
          cadence = COALESCE($7, cadence), reward_per_cycle = COALESCE($8::bigint, reward_per_cycle), active = COALESCE($9, active), updated_at = NOW()
        WHERE id = $1 AND owner_user_id = $2 RETURNING id`,
      [id, req.user!.id, body.title ?? null, body.description ?? null, category !== undefined, category ?? null, body.cadence ?? null, body.rewardPerCycle ?? null, body.active ?? null],
    )
    if (updated.rowCount === 0) throw new HttpError(403, 'Only the project owner can change this program.')
    res.json({ ok: true })
  }),
)

import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { config } from './config.js'
import { pool } from './db.js'
import { runMigrations } from './migrate.js'
import { errorHandler, securityHeaders } from './lib/http.js'
import { rateLimit } from './lib/limits.js'
import { authRouter } from './routes/auth.js'
import { bountiesRouter } from './routes/bounties.js'
import { meRouter } from './routes/me.js'
import { publicRouter } from './routes/public.js'
import { adminRouter } from './routes/admin.js'
import { categoriesRouter } from './routes/categories.js'
import { milestonesRouter } from './routes/milestones.js'
import { notificationsRouter } from './routes/notifications.js'
import { myProfileRouter, profilesRouter } from './routes/profiles.js'
import { projectsRouter, recurringRouter } from './routes/projects.js'
import { reviewsRouter } from './routes/reviews.js'
import { teamsRouter } from './routes/teams.js'
import { alertsRouter, badgeRouter, creatorsRouter, encryptionRouter, submissionsRouter } from './routes/trust.js'
import { applicationsRouter } from './routes/applications.js'
import { adminDisputesRouter, disputesRouter } from './routes/disputes.js'
import { leaderboardRouter, projectInsightsRouter } from './routes/insights.js'
import { startIndexer } from './services/indexer.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'uniquelocal') // nginx and Coolify's proxy sit in front on private networks

app.use(securityHeaders)
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin requests (nginx proxy) and server-to-server calls carry no Origin header.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true)
      return callback(null, false)
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }),
)
app.use(express.json({ limit: '64kb' }))
app.use('/api', rateLimit({ windowMs: 60_000, max: 600 }))

// The process answers as soon as it is up. Database setup continues in the background and /api returns 503 until it
// finishes, so a slow or unreachable database shows up in the logs instead of crash-looping the container.
const state = { ready: false, lastError: null as string | null }

function liveness(_req: Request, res: Response): void {
  res.json({ status: state.ready ? 'healthy' : 'starting', time: new Date().toISOString(), error: state.lastError })
}
app.get('/health', liveness)

app.get('/api/health', async (_req: Request, res: Response) => {
  if (!state.ready) {
    res.status(503).json({ status: 'starting', error: state.lastError })
    return
  }
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'healthy', time: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'unhealthy' })
  }
})

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Configuration needs no database, so the site can still describe the deployment while PostgreSQL comes up.
  if (state.ready || req.path === '/config') return next()
  res.setHeader('Retry-After', '5')
  res.status(503).json({ error: 'The service is starting. Try again in a few seconds.' })
})

app.use('/api/auth', authRouter)
app.use('/api/bounties', milestonesRouter)
app.use('/api/bounties', teamsRouter)
app.use('/api/bounties', applicationsRouter)
app.use('/api/bounties', bountiesRouter)
// Notifications and the profile form only need a Google session; the rest of /api/me also needs a linked wallet.
app.use('/api/me/notifications', notificationsRouter)
app.use('/api/me/profile', myProfileRouter)
app.use('/api/me/encryption-key', encryptionRouter)
app.use('/api/me/saved-searches', alertsRouter)
app.use('/api/me', meRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/projects', projectInsightsRouter)
app.use('/api/recurring', recurringRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/creators', creatorsRouter)
app.use('/api/disputes', disputesRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/submissions', submissionsRouter)
app.use('/api/badge', badgeRouter)
app.use('/api/admin/disputes', adminDisputesRouter)
app.use('/api/admin', adminRouter)
app.use('/api', publicRouter)

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' })
})
app.use(errorHandler)

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled rejection]', reason)
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function describeDatabase(): string {
  try {
    const url = new URL(config.databaseUrl)
    return `${url.hostname}:${url.port || '5432'}/${url.pathname.replace(/^\//, '')}`
  } catch {
    return 'an invalid DATABASE_URL'
  }
}

/** Connects to PostgreSQL, applies migrations and starts the indexer, retrying until it works. */
async function initialize(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      await runMigrations()
      startIndexer()
      state.ready = true
      state.lastError = null
      console.log('[BountyFi] Database ready')
      return
    } catch (err) {
      const e = err as Error & { code?: string }
      state.lastError = `${e.code ? `${e.code}: ` : ''}${e.message}`
      console.error(`[BountyFi] Database setup failed (attempt ${attempt}) for ${describeDatabase()}: ${state.lastError}`)
      await sleep(Math.min(3_000 * attempt, 15_000))
    }
  }
}

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[BountyFi] Listening on :${config.port} (${config.isProduction ? 'production' : 'development'})`)
  console.log(`[BountyFi] Database: ${describeDatabase()}`)
  void initialize()
})

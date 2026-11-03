import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { config } from './config.js'
import { testConnection, pool } from './db.js'
import { runMigrations } from './migrate.js'
import { errorHandler, securityHeaders } from './lib/http.js'
import { rateLimit } from './lib/limits.js'
import { authRouter } from './routes/auth.js'
import { bountiesRouter } from './routes/bounties.js'
import { meRouter } from './routes/me.js'
import { publicRouter } from './routes/public.js'
import { adminRouter } from './routes/admin.js'
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

async function health(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'healthy', time: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'unhealthy' })
  }
}
app.get('/health', health)
app.get('/api/health', health)

app.use('/api/auth', authRouter)
app.use('/api/bounties', bountiesRouter)
app.use('/api/me', meRouter)
app.use('/api/admin', adminRouter)
app.use('/api', publicRouter)

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' })
})
app.use(errorHandler)

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled rejection]', reason)
})

async function bootstrap(): Promise<void> {
  console.log('[FixBounty] Starting…')
  const dbReady = await testConnection()
  if (dbReady) {
    await runMigrations()
    startIndexer()
  } else {
    console.error('[FixBounty] Database unreachable; exiting so the orchestrator restarts the service.')
    process.exit(1)
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[FixBounty] Listening on :${config.port} (${config.isProduction ? 'production' : 'development'})`)
  })
}

bootstrap().catch((err) => {
  console.error('[FixBounty] Fatal bootstrap error:', err)
  process.exit(1)
})

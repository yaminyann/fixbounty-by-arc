import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { testConnection, pool } from './db.js'
import { runMigrations } from './migrate.js'
import { authRouter } from './routes/auth.js'
import { bountiesRouter } from './routes/bounties.js'
import { submissionsRouter, contributorSubmissionsRouter } from './routes/submissions.js'
import { activityRouter } from './routes/activity.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT) || 4000

// CORS setup: support localhost, 127.0.0.1, Coolify domains, or wildcard in dev
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, docker healthcheck)
      if (!origin) return callback(null, true)
      return callback(null, true)
    },
    credentials: true,
  })
)

app.use(express.json({ limit: '2mb' }))

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${req.method}] ${req.path}`)
    next()
  })
}

// Health Check Endpoints (Docker & Coolify readiness)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbRes = await pool.query('SELECT 1 AS ok')
    res.json({
      status: 'healthy',
      time: new Date().toISOString(),
      database: dbRes.rows[0].ok === 1 ? 'connected' : 'unhealthy',
      chain: 'Arc Testnet (5042002)',
    })
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: (err as Error).message,
    })
  }
})

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const dbRes = await pool.query('SELECT 1 AS ok')
    res.json({
      status: 'healthy',
      time: new Date().toISOString(),
      database: dbRes.rows[0].ok === 1 ? 'connected' : 'unhealthy',
    })
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: (err as Error).message,
    })
  }
})

// Mount API Routers
app.use('/api/auth', authRouter)
app.use('/api/bounties', bountiesRouter)
app.use('/api/bounties', submissionsRouter)
app.use('/api/submissions/contributor', contributorSubmissionsRouter)
app.use('/api/activity', activityRouter)

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Centralized error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Internal Server Error]', err)
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  })
})

// Start server after checking database and applying migrations
async function bootstrap() {
  console.log('[FixBounty Server] Initializing...')
  try {
    const dbReady = await testConnection()
    if (dbReady) {
      await runMigrations()
    } else {
      console.warn('[FixBounty Server] Database not reachable at startup. Will retry on request.')
    }
  } catch (err) {
    console.error('[FixBounty Server] Startup migration failed:', err)
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FixBounty Server] Listening on http://0.0.0.0:${PORT}`)
    console.log(`[FixBounty Server] Health check available at http://localhost:${PORT}/health`)
  })
}

bootstrap().catch((err) => {
  console.error('[FixBounty Server] Fatal bootstrap error:', err)
  process.exit(1)
})

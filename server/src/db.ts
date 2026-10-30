import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

function getInitialConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  const user = process.env.POSTGRES_USER || 'postgres'
  const pass = process.env.POSTGRES_PASSWORD || 'postgres'
  const host = process.env.POSTGRES_HOST || 'postgres'
  const port = process.env.POSTGRES_PORT || '5432'
  const db = process.env.POSTGRES_DB || 'postgres'
  return `postgresql://${user}:${pass}@${host}:${port}/${db}`
}

let activePool = new Pool({
  connectionString: getInitialConnectionString(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

activePool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err.message)
})

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const val = (activePool as any)[prop]
    return typeof val === 'function' ? val.bind(activePool) : val
  },
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now()
  const res = await activePool.query<T>(text, params)
  const duration = Date.now() - start
  if (process.env.NODE_ENV !== 'production' && duration > 100) {
    console.log(`[SQL slow query] ${duration}ms: ${text.slice(0, 80)}...`)
  }
  return res
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await activePool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await activePool.query('SELECT NOW() AS now, current_database() AS db')
    console.log(`[PostgreSQL Connected] Database: ${res.rows[0].db} at ${res.rows[0].now}`)
    return true
  } catch (err: any) {
    console.warn('[PostgreSQL Connection Failed with primary URL]:', err.message)

    // Check if hostname was unresolvable (e.g. nsqvnc9c1eg4s4amqrfd7zu0 outside the coolify network)
    // or if connection timed out, try internal postgres service
    const fallbackHost = 'postgres'
    const fallbackUrl = `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'postgres'}@${fallbackHost}:5432/${process.env.POSTGRES_DB || 'postgres'}`

    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('@postgres:')) {
      console.log(`[PostgreSQL] Attempting fallback to internal compose database (${fallbackHost}:5432)...`)
      try {
        const fallbackPool = new Pool({
          connectionString: fallbackUrl,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        })
        const res = await fallbackPool.query('SELECT NOW() AS now, current_database() AS db')
        console.log(`[PostgreSQL Connected via Fallback] Database: ${res.rows[0].db} at ${res.rows[0].now}`)
        activePool = fallbackPool
        return true
      } catch (fallbackErr: any) {
        console.error('[PostgreSQL Fallback Failed]:', fallbackErr.message)
      }
    }
    return false
  }
}

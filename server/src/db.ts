import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'fixbounty'}:${process.env.POSTGRES_PASSWORD || 'fixbounty_secure_pass'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'fixbounty'}`

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err)
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now()
  const res = await pool.query<T>(text, params)
  const duration = Date.now() - start
  if (process.env.NODE_ENV !== 'production' && duration > 100) {
    console.log(`[SQL slow query] ${duration}ms: ${text.slice(0, 80)}...`)
  }
  return res
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
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
    const res = await pool.query('SELECT NOW() AS now, current_database() AS db')
    console.log(`[PostgreSQL Connected] Database: ${res.rows[0].db} at ${res.rows[0].now}`)
    return true
  } catch (err) {
    console.error('[PostgreSQL Connection Failed]', err)
    return false
  }
}

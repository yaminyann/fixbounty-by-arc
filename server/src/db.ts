import pg from 'pg'
import { config } from './config.js'

const { Pool, types } = pg

// BIGINT / NUMERIC stay strings so USDC base units never lose precision in JS numbers.
types.setTypeParser(20, (v) => v)

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
  statement_timeout: 15_000,
})

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err)
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now()
  const res = await pool.query<T>(text, params)
  const duration = Date.now() - start
  if (duration > 250) {
    console.warn(`[SQL slow ${duration}ms] ${text.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  return res
}

export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT NOW() AS now, current_database() AS db')
    console.log(`[PostgreSQL] Connected to ${res.rows[0].db}`)
    return true
  } catch (err) {
    console.error('[PostgreSQL] Connection failed:', (err as Error).message)
    return false
  }
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool, withTransaction } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function runMigrations(): Promise<void> {
  console.log('[Migrations] Checking database schema...')

  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  const migrationsDir = path.join(__dirname, 'migrations')
  if (!fs.existsSync(migrationsDir)) {
    console.log('[Migrations] No migrations directory found.')
    return
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const appliedRows = await pool.query<{ version: string }>(
    'SELECT version FROM _schema_migrations'
  )
  const appliedSet = new Set(appliedRows.rows.map((r) => r.version))

  for (const file of files) {
    if (!appliedSet.has(file)) {
      console.log(`[Migrations] Applying ${file}...`)
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

      await withTransaction(async (client) => {
        await client.query(sql)
        await client.query(
          'INSERT INTO _schema_migrations (version) VALUES ($1)',
          [file]
        )
      })

      console.log(`[Migrations] ✓ Successfully applied ${file}`)
    } else {
      console.log(`[Migrations] • Skipping ${file} (already applied)`)
    }
  }

  console.log('[Migrations] All migrations up to date.')
}

// If run directly
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log('[Migrations] Finished.')
      process.exit(0)
    })
    .catch((err) => {
      console.error('[Migrations] Failed:', err)
      process.exit(1)
    })
}

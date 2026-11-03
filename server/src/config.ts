import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte address')
  .transform((v) => v.toLowerCase() as `0x${string}`)

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1).optional(),
  POSTGRES_USER: z.string().default('fixbounty'),
  POSTGRES_PASSWORD: z.string().optional(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().default(5432),
  POSTGRES_DB: z.string().default('fixbounty'),

  CORS_ORIGIN: z.string().default(''),

  FIREBASE_PROJECT_ID: z.string().min(1),
  /** Test hook only: point JWT verification at a different JWKS. Never set in production. */
  FIREBASE_JWKS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ADMIN_EMAILS: z.string().default(''),

  ARC_RPC_URL: z.string().url().default('https://rpc.testnet.arc.io'),
  CHAIN_ID: z.coerce.number().int().positive().default(5042002),
  BOUNTY_BOARD_ADDRESS: z.preprocess(emptyToUndefined, address.optional()),
  USDC_ADDRESS: address.default('0x3600000000000000000000000000000000000000'),
  TREASURY_ADDRESS: address,
  EXPLORER_URL: z.string().url().default('https://explorer.testnet.arc.io'),

  INDEXER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  INDEXER_START_BLOCK: z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().optional()),
  INDEXER_POLL_MS: z.coerce.number().int().min(500).default(4000),
  INDEXER_LOG_CHUNK: z.coerce.number().int().min(50).max(5000).default(900),
})

// One set of variables serves both the browser build and the server, so the VITE_ names are accepted as fallbacks.
const source: NodeJS.ProcessEnv = {
  ...process.env,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  ARC_RPC_URL: process.env.ARC_RPC_URL || process.env.VITE_ARC_RPC_URL,
  CHAIN_ID: process.env.CHAIN_ID || process.env.VITE_ARC_CHAIN_ID,
  EXPLORER_URL: process.env.EXPLORER_URL || process.env.VITE_ARC_EXPLORER_URL,
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || process.env.VITE_TREASURY_ADDRESS,
}

const parsed = EnvSchema.safeParse(source)
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  console.error(`[Config] Invalid environment:\n${issues}`)
  process.exit(1)
}

const env = parsed.data

const databaseUrl =
  env.DATABASE_URL ??
  `postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD ?? '')}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`

export const config = {
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl,
  corsOrigins: env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  firebaseProjectId: env.FIREBASE_PROJECT_ID,
  firebaseJwksUrl:
    env.FIREBASE_JWKS_URL ??
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  adminEmails: env.ADMIN_EMAILS.toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
  chain: {
    id: env.CHAIN_ID,
    rpcUrl: env.ARC_RPC_URL,
    explorerUrl: env.EXPLORER_URL,
    contractAddress: env.BOUNTY_BOARD_ADDRESS ?? null,
    usdcAddress: env.USDC_ADDRESS,
    treasuryAddress: env.TREASURY_ADDRESS,
  },
  indexer: {
    enabled: env.INDEXER_ENABLED,
    startBlock: env.INDEXER_START_BLOCK ?? null,
    pollMs: env.INDEXER_POLL_MS,
    logChunk: env.INDEXER_LOG_CHUNK,
  },
} as const

export type AppConfig = typeof config

import type { PoolClient } from 'pg'
import type { Address, Log } from 'viem'
import { config } from '../config.js'
import { pool, query, withTransaction } from '../db.js'
import { BOUNTY_BOARD_ABI } from '../abi.js'
import { publicClient, readBounty, readBountyCount, type OnchainBounty } from '../chain.js'
import { applyWinnerPositions, upsertChainBounty } from './bountySync.js'
import { notify } from './notify.js'
import { reviewerUserIds } from '../lib/ecosystem.js'

/**
 * Chain indexer. The contract is the source of truth; this keeps PostgreSQL in step with it
 * so every page loads from one indexed query instead of fanning out RPC calls.
 *
 *  - walks contract events in block chunks from a persisted cursor
 *  - re-reads the on-chain state of every bounty an event touched
 *  - records activity and platform fees idempotently ((tx_hash, log_index) is unique)
 *  - periodically reconciles bounties that are still live in case an event was missed
 */

const CURSOR_KEY = 'last_block'
const ADVISORY_LOCK_ID = 727_001

export const indexerStatus = {
  running: false,
  holdsLock: false,
  lastBlock: null as number | null,
  latestBlock: null as number | null,
  lastRunAt: null as string | null,
  lastError: null as string | null,
}

let chunkSize = config.indexer.logChunk
let wakeUp: (() => void) | null = null

/** Ask the loop to run immediately (e.g. right after a user's transaction was reported). */
export function nudgeIndexer(): void {
  wakeUp?.()
}

interface DecodedLog {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint
  logIndex: number
  transactionHash: `0x${string}`
}

async function getCursor(): Promise<number | null> {
  const res = await query<{ value: string }>('SELECT value FROM indexer_state WHERE key = $1', [CURSOR_KEY])
  return res.rows[0] ? Number(res.rows[0].value) : null
}

async function setCursor(block: number): Promise<void> {
  await query(
    `INSERT INTO indexer_state (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CURSOR_KEY, String(block)],
  )
}

async function hasCodeAt(address: Address, block: number): Promise<boolean> {
  const code = await publicClient.getCode({ address, blockNumber: BigInt(block) })
  return Boolean(code && code !== '0x')
}

/** Binary-searches the first block at which the contract exists. */
async function findDeploymentBlock(address: Address, latest: number): Promise<number> {
  try {
    if (!(await hasCodeAt(address, latest))) return latest
    let lo = 0
    let hi = latest
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (await hasCodeAt(address, mid)) hi = mid
      else lo = mid + 1
    }
    return lo
  } catch (err) {
    console.warn('[Indexer] Could not locate deployment block, starting from head:', (err as Error).message)
    return latest
  }
}

async function fetchLogs(address: Address, from: number, to: number): Promise<DecodedLog[]> {
  const logs = (await publicClient.getContractEvents({
    address,
    abi: BOUNTY_BOARD_ABI,
    fromBlock: BigInt(from),
    toBlock: BigInt(to),
  })) as unknown as Array<Log & { eventName: string; args: Record<string, unknown> }>

  return logs
    .filter((l) => l.blockNumber !== null && l.logIndex !== null && l.transactionHash !== null)
    .map((l) => ({
      eventName: l.eventName,
      args: l.args,
      blockNumber: l.blockNumber as bigint,
      logIndex: l.logIndex as number,
      transactionHash: l.transactionHash as `0x${string}`,
    }))
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
}

async function blockTimes(blocks: bigint[]): Promise<Map<string, number>> {
  const unique = [...new Set(blocks.map((b) => b.toString()))]
  const out = new Map<string, number>()
  await Promise.all(
    unique.map(async (b) => {
      const block = await publicClient.getBlock({ blockNumber: BigInt(b) })
      out.set(b, Number(block.timestamp))
    }),
  )
  return out
}

const ACTIVITY_KIND: Record<string, string> = {
  BountyCreated: 'created',
  BountyFunded: 'funded',
  WorkSubmitted: 'submitted',
  WinnerApproved: 'winner',
  BountyApproved: 'approved',
  RewardClaimed: 'claimed',
  BountyRefunded: 'refunded',
  BountyCancelled: 'cancelled',
}

async function processLogs(logs: DecodedLog[]): Promise<void> {
  if (logs.length === 0) return

  const ids = [...new Set(logs.map((l) => Number(l.args.bountyId as bigint)))]
  const states = new Map<number, OnchainBounty>()
  await Promise.all(
    ids.map(async (id) => {
      const state = await readBounty(id)
      if (state) states.set(id, state)
    }),
  )
  const times = await blockTimes(logs.map((l) => l.blockNumber))

  await withTransaction(async (db) => {
    const rowIds = new Map<number, string>()
    for (const [id, state] of states) {
      rowIds.set(id, await upsertChainBounty(state, db))
    }

    for (const log of logs) {
      const onchainId = Number(log.args.bountyId as bigint)
      const bountyRowId = rowIds.get(onchainId)
      const state = states.get(onchainId)
      if (!bountyRowId || !state) continue

      const blockTime = times.get(log.blockNumber.toString()) ?? Math.floor(Date.now() / 1000)
      const common = [bountyRowId, onchainId, log.transactionHash, log.logIndex, log.blockNumber.toString(), blockTime]

      if (log.eventName === 'PlatformFeePaid') {
        await db.query(
          `INSERT INTO platform_fees (bounty_id, onchain_id, payer_wallet, amount, kind, tx_hash, log_index, block_number, block_time)
           VALUES ($1, $2, $7, $8, $9, $3, $4, $5, to_timestamp($6::double precision))
           ON CONFLICT (tx_hash, log_index) DO NOTHING`,
          [...common, (log.args.payer as string).toLowerCase(), (log.args.amount as bigint).toString(), Number(log.args.kind)],
        )
        continue
      }

      const kind = ACTIVITY_KIND[log.eventName]
      if (!kind) continue

      let actor: string | null = null
      let position: number | null = null
      let amount: bigint | null = null
      let fee: bigint | null = null

      switch (log.eventName) {
        case 'BountyCreated':
          actor = (log.args.creator as string).toLowerCase()
          amount = log.args.reward as bigint
          break
        case 'BountyFunded':
          actor = (log.args.creator as string).toLowerCase()
          amount = log.args.reward as bigint
          fee = log.args.fee as bigint
          break
        case 'WorkSubmitted': {
          actor = (log.args.contributor as string).toLowerCase()
          await db.query(
            `INSERT INTO submissions (bounty_id, submitter_wallet, submitter_user_id, submission_hash, tx_hash)
             VALUES ($1, $2::varchar, (SELECT user_id FROM wallets WHERE address = $2::varchar), $3, $4)
             ON CONFLICT (bounty_id, submitter_wallet) DO UPDATE SET
               submission_hash = EXCLUDED.submission_hash,
               tx_hash = COALESCE(submissions.tx_hash, EXCLUDED.tx_hash),
               updated_at = NOW()`,
            [bountyRowId, actor, log.args.submissionHash as string, log.transactionHash],
          )
          for (const reviewer of await reviewerUserIds(bountyRowId, db)) {
            await notify(
              {
                userId: reviewer,
                kind: 'new_submission',
                title: 'New submission to review',
                body: state.title,
                link: `/bounty/${onchainId}?tab=submissions`,
                dedupeKey: `submitted:${log.transactionHash}:${log.logIndex}`,
              },
              db,
            )
          }
          break
        }
        case 'WinnerApproved':
          actor = (log.args.contributor as string).toLowerCase()
          position = Number(log.args.position)
          amount = log.args.payout as bigint
          await notify(
            {
              userId: (await db.query<{ user_id: string }>('SELECT user_id FROM wallets WHERE address = $1', [actor])).rows[0]?.user_id,
              kind: 'won',
              title: `You won ${position === 1 ? '1st' : position === 2 ? '2nd' : position === 3 ? '3rd' : `${position}th`} place`,
              body: state.title,
              link: `/bounty/${onchainId}`,
              dedupeKey: `winner:${log.transactionHash}:${log.logIndex}`,
            },
            db,
          )
          break
        case 'BountyApproved':
          actor = state.creator
          position = Number(log.args.winnerCount)
          amount = log.args.returnedToCreator as bigint
          break
        case 'RewardClaimed':
          actor = (log.args.contributor as string).toLowerCase()
          position = Number(log.args.position)
          amount = log.args.payout as bigint
          fee = log.args.fee as bigint
          break
        case 'BountyRefunded':
          actor = (log.args.creator as string).toLowerCase()
          amount = log.args.amount as bigint
          break
        case 'BountyCancelled':
          actor = (log.args.creator as string).toLowerCase()
          break
      }

      await db.query(
        `INSERT INTO bounty_activity (bounty_id, onchain_id, tx_hash, log_index, block_number, block_time, kind, actor_wallet, position, amount, fee)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision), $7, $8, $9, $10, $11)
         ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [...common, kind, actor, position, amount?.toString() ?? null, fee?.toString() ?? null],
      )
    }

    // Submissions created in this chunk now exist, so winners can be stamped with their position.
    for (const [id, state] of states) {
      const rowId = rowIds.get(id)
      if (rowId) await applyWinnerPositions(rowId, state.winners, db)
    }
  })
}

async function indexNewBlocks(address: Address): Promise<void> {
  const latest = Number(await publicClient.getBlockNumber())
  indexerStatus.latestBlock = latest

  let cursor = await getCursor()
  if (cursor === null) {
    const start = config.indexer.startBlock ?? (await findDeploymentBlock(address, latest))
    cursor = Math.max(start - 1, -1)
    console.log(`[Indexer] Starting from block ${start}`)
  }

  while (cursor < latest) {
    const from = cursor + 1
    const to = Math.min(latest, from + chunkSize - 1)
    try {
      await processLogs(await fetchLogs(address, from, to))
    } catch (err) {
      const message = (err as Error).message.toLowerCase()
      if ((message.includes('range') || message.includes('too large') || message.includes('limit')) && chunkSize > 50) {
        chunkSize = Math.max(50, Math.floor(chunkSize / 2))
        console.warn(`[Indexer] RPC rejected block range, retrying with chunk=${chunkSize}`)
        continue
      }
      throw err
    }
    await setCursor(to)
    cursor = to
    indexerStatus.lastBlock = cursor
  }
  indexerStatus.lastBlock = cursor
}

/** Refreshes live bounties that have not been synced recently, healing any missed event. */
async function reconcile(): Promise<void> {
  const contract = config.chain.contractAddress
  if (!contract) return

  const stale = await query<{ onchain_id: string }>(
    `SELECT onchain_id FROM bounties
      WHERE contract_address = $1 AND onchain_status IN (0, 1, 2)
        AND chain_synced_at < NOW() - INTERVAL '3 minutes'
      ORDER BY chain_synced_at ASC LIMIT 40`,
    [contract],
  )
  for (const row of stale.rows) {
    const state = await readBounty(Number(row.onchain_id))
    if (state) await upsertChainBounty(state)
  }

  // Bounties that exist on-chain but were never indexed (e.g. cursor started late).
  const [count, known] = await Promise.all([
    readBountyCount(),
    query<{ max: string | null }>('SELECT MAX(onchain_id)::text AS max FROM bounties WHERE contract_address = $1', [contract]),
  ])
  const highest = Number(known.rows[0]?.max ?? 0)
  for (let id = highest + 1; id <= Math.min(count, highest + 25); id += 1) {
    const state = await readBounty(id)
    if (state) await upsertChainBounty(state)
  }
}

async function cleanup(): Promise<void> {
  await query('DELETE FROM wallet_challenges WHERE expires_at < NOW() - INTERVAL \'1 hour\'')
}

export function startIndexer(): void {
  const address = config.chain.contractAddress
  if (!config.indexer.enabled) {
    console.log('[Indexer] Disabled by configuration')
    return
  }
  if (!address) {
    console.warn('[Indexer] BOUNTY_BOARD_ADDRESS is not set; indexer is idle until the contract is deployed')
    return
  }

  indexerStatus.running = true
  let lastReconcile = 0
  let lastCleanup = 0
  const lock: { held: boolean; client: PoolClient | null } = { held: false, client: null }

  const loop = async (): Promise<void> => {
    for (;;) {
      try {
        if (!lock.held) {
          lock.client = lock.client ?? (await pool.connect())
          const res = await lock.client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_ID])
          lock.held = res.rows[0].locked
          indexerStatus.holdsLock = lock.held
        }

        if (lock.held) {
          await indexNewBlocks(address)
          const now = Date.now()
          if (now - lastReconcile > 60_000) {
            lastReconcile = now
            await reconcile()
          }
          if (now - lastCleanup > 10 * 60_000) {
            lastCleanup = now
            await cleanup()
          }
          indexerStatus.lastError = null
        }
        indexerStatus.lastRunAt = new Date().toISOString()
      } catch (err) {
        indexerStatus.lastError = (err as Error).message
        console.error('[Indexer] Tick failed:', (err as Error).message)
        if (lock.client) {
          // A broken connection loses the advisory lock; start over with a fresh one.
          lock.client.release(true)
          lock.client = null
          lock.held = false
          indexerStatus.holdsLock = false
        }
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, config.indexer.pollMs)
        wakeUp = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      wakeUp = null
    }
  }

  void loop()
}

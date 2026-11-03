import type { QueryResult, QueryResultRow } from 'pg'
import { config } from '../config.js'
import { query } from '../db.js'
import { readBounty, type OnchainBounty } from '../chain.js'

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>
}

/**
 * Writes the on-chain state of a bounty into the database mirror and returns its row id.
 * Off-chain metadata and moderation columns are never touched here.
 */
export async function upsertChainBounty(b: OnchainBounty, db: Queryable = { query }): Promise<string> {
  const contract = config.chain.contractAddress
  if (!contract) throw new Error('BountyBoard contract address is not configured')

  const res = await db.query<{ id: string }>(
    `INSERT INTO bounties (
       contract_address, onchain_id, creator_wallet, title, content_hash, reward_amount, deadline,
       onchain_status, funded_at, approved_at, winner_slots, winner_count, claimed_count,
       submission_count, unclaimed_amount, prize_shares, prize_payouts, winners, winners_claimed,
       token_address, chain_synced_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, to_timestamp($7::double precision),
       $8, CASE WHEN $9::bigint = 0 THEN NULL ELSE to_timestamp($9::double precision) END,
       CASE WHEN $10::bigint = 0 THEN NULL ELSE to_timestamp($10::double precision) END,
       $11, $12, $13, $14, $15, $16::int[], $17::bigint[], $18::text[], $19::boolean[],
       $20, NOW(), NOW()
     )
     ON CONFLICT (contract_address, onchain_id) DO UPDATE SET
       onchain_status = EXCLUDED.onchain_status,
       funded_at = EXCLUDED.funded_at,
       approved_at = EXCLUDED.approved_at,
       winner_count = EXCLUDED.winner_count,
       claimed_count = EXCLUDED.claimed_count,
       submission_count = EXCLUDED.submission_count,
       unclaimed_amount = EXCLUDED.unclaimed_amount,
       winners = EXCLUDED.winners,
       winners_claimed = EXCLUDED.winners_claimed,
       chain_synced_at = NOW(),
       updated_at = NOW()
     RETURNING id`,
    [
      contract,
      b.id,
      b.creator,
      b.title,
      b.contentHash,
      b.reward.toString(),
      b.deadline.toString(),
      b.status,
      b.fundedAt.toString(),
      b.approvedAt.toString(),
      b.winnerSlots,
      b.winnerCount,
      b.claimedCount,
      b.submissionCount,
      b.unclaimedAmount.toString(),
      b.sharesBps,
      b.payouts.map((p) => p.toString()),
      b.winners,
      b.winnersClaimed,
      config.chain.usdcAddress,
    ],
  )

  const bountyId = res.rows[0].id
  await applyWinnerPositions(bountyId, b.winners, db)
  return bountyId
}

/** Stamps each approved winner's prize position onto their submission row. */
export async function applyWinnerPositions(bountyId: string, winners: string[], db: Queryable = { query }): Promise<void> {
  if (winners.length === 0) return
  await db.query(
    `UPDATE submissions s
        SET position = w.pos, updated_at = NOW()
       FROM unnest($2::text[]) WITH ORDINALITY AS w(wallet, pos)
      WHERE s.bounty_id = $1 AND s.submitter_wallet = w.wallet AND s.position IS DISTINCT FROM w.pos`,
    [bountyId, winners],
  )
}

/** Reads a bounty from the chain and mirrors it. Returns false when the id does not exist yet. */
export async function syncBounty(onchainId: number, db: Queryable = { query }): Promise<{ id: string; chain: OnchainBounty } | null> {
  const chain = await readBounty(onchainId)
  if (!chain) return null
  const id = await upsertChainBounty(chain, db)
  return { id, chain }
}

-- ==============================================================================
-- 003: Platform v2
--   * chain-mirrored bounties with admin moderation (only approved bounties are public)
--   * multi-winner prize structure and platform-fee ledger
--   * chain event indexer state
--   * one wallet <-> one Google account
-- Tables from the previous contract are kept as legacy_* so no data is lost.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Park the previous contract's tables
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS bounty_activity RENAME TO legacy_bounty_activity;
ALTER TABLE IF EXISTS submissions RENAME TO legacy_submissions;
ALTER TABLE IF EXISTS bounties RENAME TO legacy_bounties;

-- ------------------------------------------------------------------------------
-- 2. Users
-- ------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE users SET firebase_uid = 'legacy-' || id::text WHERE firebase_uid IS NULL;
ALTER TABLE users ALTER COLUMN firebase_uid SET NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. Wallets: a wallet belongs to exactly one account and an account has one wallet
-- ------------------------------------------------------------------------------
UPDATE wallets SET address = LOWER(address);

DELETE FROM wallets w
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY address ORDER BY linked_at DESC, id) AS rn FROM wallets
) d
WHERE w.id = d.id AND d.rn > 1;

DELETE FROM wallets w
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY linked_at DESC, id) AS rn FROM wallets
) d
WHERE w.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallets_address ON wallets (address);
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallets_user ON wallets (user_id);

-- Challenges are now bound to the signed-in user and short lived.
DELETE FROM wallet_challenges;
ALTER TABLE wallet_challenges ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wallet_challenges ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ix_wallet_challenges_user ON wallet_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wallet_challenges_expiry ON wallet_challenges (expires_at);

-- ------------------------------------------------------------------------------
-- 4. Bounties
-- ------------------------------------------------------------------------------
CREATE TABLE bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- chain mirror (authoritative values come from the contract)
  contract_address VARCHAR(42) NOT NULL,
  onchain_id BIGINT NOT NULL,
  creator_wallet VARCHAR(42) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content_hash VARCHAR(160) NOT NULL DEFAULT '',
  reward_amount BIGINT NOT NULL,                  -- total prize pool, USDC base units (6 decimals)
  deadline TIMESTAMPTZ NOT NULL,
  onchain_status SMALLINT NOT NULL DEFAULT 0,     -- 0 Open, 1 Funded, 2 Approved, 3 Claimed, 4 Refunded, 5 Cancelled
  funded_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  winner_slots SMALLINT NOT NULL DEFAULT 1,
  winner_count SMALLINT NOT NULL DEFAULT 0,
  claimed_count SMALLINT NOT NULL DEFAULT 0,
  submission_count INTEGER NOT NULL DEFAULT 0,
  unclaimed_amount BIGINT NOT NULL DEFAULT 0,
  prize_shares INTEGER[] NOT NULL DEFAULT '{10000}',   -- basis points per position
  prize_payouts BIGINT[] NOT NULL DEFAULT '{}',        -- gross payout per position
  winners TEXT[] NOT NULL DEFAULT '{}',                -- approved winners in position order
  winners_claimed BOOLEAN[] NOT NULL DEFAULT '{}',
  token_symbol VARCHAR(10) NOT NULL DEFAULT 'USDC',
  token_address VARCHAR(42) NOT NULL DEFAULT '0x3600000000000000000000000000000000000000',
  chain_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- off-chain metadata (verified against content_hash)
  creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  acceptance_criteria TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  links TEXT[] NOT NULL DEFAULT '{}',
  metadata_verified BOOLEAN NOT NULL DEFAULT FALSE,
  tx_hash VARCHAR(66),

  -- moderation: only 'approved' bounties are visible on the platform
  moderation_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  moderated_by VARCHAR(255),
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT,

  search_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, ''))
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_bounties_moderation CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT ux_bounties_chain UNIQUE (contract_address, onchain_id)
);

-- Public listing paths (partial indexes keep them tiny and fast)
CREATE INDEX ix_bounties_public_created ON bounties (created_at DESC) WHERE moderation_status = 'approved';
CREATE INDEX ix_bounties_public_status ON bounties (onchain_status, created_at DESC) WHERE moderation_status = 'approved';
CREATE INDEX ix_bounties_public_reward ON bounties (reward_amount DESC) WHERE moderation_status = 'approved';
CREATE INDEX ix_bounties_public_deadline ON bounties (deadline) WHERE moderation_status = 'approved';
CREATE INDEX ix_bounties_moderation ON bounties (moderation_status, created_at DESC);
CREATE INDEX ix_bounties_creator_wallet ON bounties (creator_wallet, created_at DESC);
CREATE INDEX ix_bounties_creator_user ON bounties (creator_user_id, created_at DESC);
CREATE INDEX ix_bounties_search ON bounties USING GIN (search_tsv);
CREATE INDEX ix_bounties_tags ON bounties USING GIN (tags);
CREATE INDEX ix_bounties_open_sync ON bounties (chain_synced_at) WHERE onchain_status IN (0, 1, 2);

-- ------------------------------------------------------------------------------
-- 5. Submissions
-- ------------------------------------------------------------------------------
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  submitter_wallet VARCHAR(42) NOT NULL,
  submitter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submission_hash VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT,                       -- NULL until the notes are attached
  pull_request_url TEXT,
  attachments TEXT[] NOT NULL DEFAULT '{}',
  notes_verified BOOLEAN NOT NULL DEFAULT FALSE,
  position SMALLINT,                      -- prize position once approved as a winner
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_submissions_bounty_wallet UNIQUE (bounty_id, submitter_wallet)
);

CREATE INDEX ix_submissions_bounty ON submissions (bounty_id, created_at DESC);
CREATE INDEX ix_submissions_wallet ON submissions (submitter_wallet, created_at DESC);
CREATE INDEX ix_submissions_user ON submissions (submitter_user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. Activity (derived from chain events only, so it cannot be forged)
-- ------------------------------------------------------------------------------
CREATE TABLE bounty_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  onchain_id BIGINT NOT NULL,
  kind VARCHAR(24) NOT NULL,              -- created, funded, submitted, winner, approved, claimed, refunded, cancelled
  actor_wallet VARCHAR(42),
  position SMALLINT,
  amount BIGINT,
  fee BIGINT,
  tx_hash VARCHAR(66) NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  CONSTRAINT ux_activity_event UNIQUE (tx_hash, log_index)
);

CREATE INDEX ix_activity_time ON bounty_activity (block_time DESC);
CREATE INDEX ix_activity_bounty ON bounty_activity (bounty_id, block_time DESC);
CREATE INDEX ix_activity_actor ON bounty_activity (actor_wallet, block_time DESC);

-- ------------------------------------------------------------------------------
-- 7. Platform revenue ledger (PlatformFeePaid events)
-- ------------------------------------------------------------------------------
CREATE TABLE platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  onchain_id BIGINT NOT NULL,
  payer_wallet VARCHAR(42) NOT NULL,
  amount BIGINT NOT NULL,
  kind SMALLINT NOT NULL,                 -- 0 = post fee (0.5%), 1 = claim fee (5%)
  tx_hash VARCHAR(66) NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  CONSTRAINT ux_fees_event UNIQUE (tx_hash, log_index)
);

CREATE INDEX ix_fees_time ON platform_fees (block_time DESC);
CREATE INDEX ix_fees_kind_time ON platform_fees (kind, block_time DESC);

-- ------------------------------------------------------------------------------
-- 8. Indexer cursor and admin audit trail
-- ------------------------------------------------------------------------------
CREATE TABLE indexer_state (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(48) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_audit_time ON admin_audit_log (created_at DESC);

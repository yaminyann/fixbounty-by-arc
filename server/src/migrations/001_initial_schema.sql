-- ==============================================================================
-- FixBounty PostgreSQL Relational Schema
-- Migration 001: Initial Tables, Constraints, Indexes & Seed
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Users Table (Google / Firebase verified identity)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) UNIQUE,
  email VARCHAR(255),
  display_name VARCHAR(255),
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ------------------------------------------------------------------------------
-- 2. Wallets Table (Normalized Arc Testnet / EVM wallet addresses)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address VARCHAR(42) NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 5042002,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_method VARCHAR(50) NOT NULL DEFAULT 'signature_challenge',
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_wallet UNIQUE (user_id, address)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);

-- ------------------------------------------------------------------------------
-- 3. Wallet Signature Challenges (Nonce and challenge text for cryptographic proof)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address VARCHAR(42) NOT NULL,
  nonce VARCHAR(64) NOT NULL,
  challenge_text TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_challenges_addr ON wallet_challenges(address);

-- ------------------------------------------------------------------------------
-- 4. Bounties Table (Onchain financial anchor + relational metadata)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onchain_id INTEGER UNIQUE,
  creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_wallet VARCHAR(42) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  reward_amount BIGINT NOT NULL, -- in USDC atomic base units (6 decimals: 2500000 = 2.50 USDC)
  token_symbol VARCHAR(10) NOT NULL DEFAULT 'USDC',
  token_address VARCHAR(42) NOT NULL DEFAULT '0x3600000000000000000000000000000000000000',
  deadline TIMESTAMPTZ NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  links TEXT[] NOT NULL DEFAULT '{}',
  tx_hash VARCHAR(66),
  onchain_status INTEGER NOT NULL DEFAULT 0, -- 0=Open, 1=Funded, 2=Approved, 3=Claimed, 4=Refunded, 5=Cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bounties_onchain_id ON bounties(onchain_id);
CREATE INDEX IF NOT EXISTS idx_bounties_creator_wallet ON bounties(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_bounties_creator_user_id ON bounties(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(onchain_status);

-- ------------------------------------------------------------------------------
-- 5. Submissions Table (Work submissions by authenticated contributors)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  onchain_bounty_id INTEGER NOT NULL,
  submitter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitter_wallet VARCHAR(42) NOT NULL,
  description TEXT NOT NULL,
  pull_request_url TEXT NOT NULL,
  attachments TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'claimed', 'rejected'
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bounty_submitter UNIQUE (bounty_id, submitter_wallet)
);

CREATE INDEX IF NOT EXISTS idx_submissions_bounty_id ON submissions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_submissions_onchain_id ON submissions(onchain_bounty_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitter_wallet ON submissions(submitter_wallet);
CREATE INDEX IF NOT EXISTS idx_submissions_submitter_user_id ON submissions(submitter_user_id);

-- ------------------------------------------------------------------------------
-- 6. Bounty Activity Table (Audit trail of events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bounty_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID REFERENCES bounties(id) ON DELETE CASCADE,
  onchain_bounty_id INTEGER,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_wallet VARCHAR(42),
  action VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_bounty_id ON bounty_activity(bounty_id);
CREATE INDEX IF NOT EXISTS idx_activity_onchain_id ON bounty_activity(onchain_bounty_id);

-- ------------------------------------------------------------------------------
-- 7. Seed Onchain Bounty #1 (Pre-existing on Arc Testnet)
-- ------------------------------------------------------------------------------
INSERT INTO bounties (
  onchain_id,
  creator_wallet,
  title,
  description,
  acceptance_criteria,
  reward_amount,
  token_symbol,
  token_address,
  deadline,
  tags,
  links,
  onchain_status
)
VALUES (
  1,
  '0x378862a20b312298dc54585cbabc531d70f9bae9',
  'Fix Dark Mode Toggle Flicker on Page Reload',
  'When users refresh the application in dark mode, there is a momentary flash of unstyled light content (FOUC). The theme script needs to be injected inline into the document head prior to DOM rendering, persisting the user preference in localStorage.',
  '1. Zero flash of light background when page reloads with dark theme selected.\n2. Respect system prefers-color-scheme when no explicit preference is stored.\n3. Smooth transition toggle without breaking SSR or React hydration.',
  2500000, -- 2.50 USDC
  'USDC',
  '0x3600000000000000000000000000000000000000',
  to_timestamp(1761694740),
  ARRAY['react', 'css', 'fouc', 'ui'],
  ARRAY['https://github.com/example/repo/issues/42'],
  1 -- Funded
)
ON CONFLICT (onchain_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  acceptance_criteria = EXCLUDED.acceptance_criteria,
  reward_amount = EXCLUDED.reward_amount,
  onchain_status = EXCLUDED.onchain_status,
  updated_at = NOW();

-- ==============================================================================
-- Migration 003: V2 Features - Categories, Moderation, Profile Fields,
--                Sequence Numbers, Fee Events Ledger, and Admin Log
-- ==============================================================================

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20) NOT NULL DEFAULT '#000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Seed standard developer categories
INSERT INTO categories (slug, name, description, color) VALUES
  ('bug-fix',       'Bug Fix',        'Fix a bug or unexpected defect in production code', '#ef4444'),
  ('feature',       'Feature',        'Build a new feature, module, or user capability',   '#3b82f6'),
  ('documentation', 'Documentation',  'Improve technical docs, tutorials, or codebase guides', '#8b5cf6'),
  ('security',      'Security',       'Vulnerability mitigation, security patch, or audit', '#f97316'),
  ('performance',   'Performance',    'Optimize compute runtime, memory footprint, or gas', '#14b8a6'),
  ('testing',       'Testing',        'Write unit, fuzz, invariant, or end-to-end test suites', '#22c55e'),
  ('design',        'Design & UI',    'UI/UX design polish, accessibility, and styling',   '#ec4899'),
  ('other',         'Other',          'General tasks, DevOps, refactoring, or integrations', '#6b7280')
ON CONFLICT (slug) DO NOTHING;

-- 2. Extend Bounties with Category, Moderation & Metadata fields
ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS category_slug VARCHAR(64) REFERENCES categories(slug) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_note TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by VARCHAR(128),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS contract_version SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_bounties_category_slug ON bounties(category_slug);
CREATE INDEX IF NOT EXISTS idx_bounties_moderation_status ON bounties(moderation_status);

-- 3. Extend Users Table with Developer Social Profile & Admin Flags
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS github VARCHAR(100),
  ADD COLUMN IF NOT EXISTS twitter VARCHAR(100),
  ADD COLUMN IF NOT EXISTS website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- 4. Extend Submissions with Stable Sequence Number
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS seq_number INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_submissions_bounty_seq ON submissions(bounty_id, seq_number ASC);

-- 5. Platform Fee Events Ledger (Mirrors on-chain RewardClaimed events)
CREATE TABLE IF NOT EXISTS fee_events (
  id SERIAL PRIMARY KEY,
  bounty_id INTEGER NOT NULL,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  block_number BIGINT NOT NULL DEFAULT 0,
  contributor_addr VARCHAR(42) NOT NULL,
  reward_amount NUMERIC(30,6) NOT NULL,
  fee_amount NUMERIC(30,6) NOT NULL DEFAULT 0,
  treasury_addr VARCHAR(42) NOT NULL,
  network VARCHAR(20) NOT NULL DEFAULT 'testnet',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_events_bounty_id ON fee_events(bounty_id);
CREATE INDEX IF NOT EXISTS idx_fee_events_recorded_at ON fee_events(recorded_at DESC);

-- 6. Admin Moderation & Action Audit Log
CREATE TABLE IF NOT EXISTS admin_log (
  id SERIAL PRIMARY KEY,
  admin_uid VARCHAR(128) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL DEFAULT 'bounty',
  target_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_log_created_at ON admin_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin_uid ON admin_log(admin_uid);

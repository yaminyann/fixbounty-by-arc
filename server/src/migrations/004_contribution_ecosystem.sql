-- ==============================================================================
-- 004: Contribution ecosystem
--   * categories (manageable list), project workspaces, contributor profiles
--   * listing details on bounties that are NOT part of the on-chain content hash
--   * milestones, submission reviews with comment threads, team coordination, recurring programs
--   * in-app notifications
-- Everything here is application data. Money, status and winners stay on-chain.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Categories
-- ------------------------------------------------------------------------------
CREATE TABLE categories (
  slug VARCHAR(40) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  icon VARCHAR(32) NOT NULL DEFAULT 'code',
  examples TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (slug, name, description, icon, examples, sort_order) VALUES
  ('security', 'Security & bug bounty', 'Find and report weaknesses before attackers do.', 'shield-check',
   ARRAY['Smart contract vulnerabilities', 'Website security', 'Penetration testing', 'Vulnerability reporting'], 10),
  ('development', 'Development', 'Ship code: fixes, features and integrations.', 'code',
   ARRAY['GitHub issues', 'Feature development', 'API integration', 'Open-source contributions'], 20),
  ('design', 'Design & creative', 'Interfaces, brands and media.', 'palette',
   ARRAY['UI/UX design', 'Branding and logo design', 'Landing pages', 'Video and content creation'], 30),
  ('research', 'Research & intelligence', 'Answers backed by evidence.', 'telescope',
   ARRAY['Market research', 'Competitor analysis', 'Technical research', 'Data collection'], 40),
  ('community', 'Community & growth', 'Reach, educate and support people.', 'users',
   ARRAY['Community building', 'Translation', 'Educational content', 'Social media campaigns'], 50),
  ('testing', 'Testing & validation', 'Try it, break it, report back.', 'flask-conical',
   ARRAY['QA testing', 'Application testing', 'Testnet participation', 'Product feedback'], 60);

-- ------------------------------------------------------------------------------
-- 2. Contributor profiles (public fields are chosen by the user)
-- ------------------------------------------------------------------------------
CREATE TABLE contributor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(60),
  bio VARCHAR(500),
  skills TEXT[] NOT NULL DEFAULT '{}',
  website_url VARCHAR(300),
  github_url VARCHAR(300),
  avatar_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Projects (workspaces)
-- ------------------------------------------------------------------------------
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  tagline VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  website_url VARCHAR(300),
  github_url VARCHAR(300),
  logo_url VARCHAR(500),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_wallet VARCHAR(42) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_projects_status CHECK (status IN ('active', 'hidden'))
);

CREATE INDEX ix_projects_owner ON projects (owner_user_id, created_at DESC);
CREATE INDEX ix_projects_status ON projects (status, created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. Recurring programs (planning records; each cycle is a normal on-chain bounty)
-- ------------------------------------------------------------------------------
CREATE TABLE recurring_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(40) REFERENCES categories(slug) ON DELETE SET NULL,
  cadence VARCHAR(12) NOT NULL,
  reward_per_cycle BIGINT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  started_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_recurring_cadence CHECK (cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
  CONSTRAINT ck_recurring_reward CHECK (reward_per_cycle > 0)
);

CREATE INDEX ix_recurring_project ON recurring_programs (project_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. Listing details on bounties (not hashed on-chain, editable by the creator)
-- ------------------------------------------------------------------------------
ALTER TABLE bounties ADD COLUMN category VARCHAR(40) REFERENCES categories(slug) ON DELETE SET NULL;
ALTER TABLE bounties ADD COLUMN difficulty VARCHAR(12);
ALTER TABLE bounties ADD COLUMN skills TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE bounties ADD COLUMN work_mode VARCHAR(8) NOT NULL DEFAULT 'solo';
ALTER TABLE bounties ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE bounties ADD COLUMN recurring_program_id UUID REFERENCES recurring_programs(id) ON DELETE SET NULL;
ALTER TABLE bounties ADD COLUMN submission_instructions TEXT;
ALTER TABLE bounties ADD COLUMN eligibility TEXT;
ALTER TABLE bounties ADD CONSTRAINT ck_bounties_difficulty CHECK (difficulty IS NULL OR difficulty IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE bounties ADD CONSTRAINT ck_bounties_work_mode CHECK (work_mode IN ('solo', 'team'));

CREATE INDEX ix_bounties_category ON bounties (category, created_at DESC) WHERE moderation_status = 'approved';
CREATE INDEX ix_bounties_project ON bounties (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX ix_bounties_program ON bounties (recurring_program_id) WHERE recurring_program_id IS NOT NULL;
CREATE INDEX ix_bounties_skills ON bounties USING GIN (skills);

-- ------------------------------------------------------------------------------
-- 6. Review state on the on-chain submissions
-- ------------------------------------------------------------------------------
ALTER TABLE submissions ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'submitted';
ALTER TABLE submissions ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE submissions ADD CONSTRAINT ck_submissions_review CHECK (review_status IN ('submitted', 'changes_requested', 'approved', 'rejected'));

-- ------------------------------------------------------------------------------
-- 7. Milestones and the work submitted against them
-- ------------------------------------------------------------------------------
CREATE TABLE bounty_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward_amount BIGINT NOT NULL,                  -- planned share of the escrowed prize, USDC base units
  approved_submission_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_milestone_reward CHECK (reward_amount > 0),
  CONSTRAINT ux_milestone_position UNIQUE (bounty_id, position)
);

CREATE INDEX ix_milestones_bounty ON bounty_milestones (bounty_id, position);

CREATE TABLE milestone_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES bounty_milestones(id) ON DELETE CASCADE,
  submitter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitter_wallet VARCHAR(42) NOT NULL,
  description TEXT NOT NULL,
  links TEXT[] NOT NULL DEFAULT '{}',
  review_status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_milestone_sub_review CHECK (review_status IN ('submitted', 'changes_requested', 'approved', 'rejected')),
  CONSTRAINT ux_milestone_sub UNIQUE (milestone_id, submitter_wallet)
);

CREATE INDEX ix_milestone_subs_milestone ON milestone_submissions (milestone_id, created_at DESC);
CREATE INDEX ix_milestone_subs_wallet ON milestone_submissions (submitter_wallet, created_at DESC);

-- ------------------------------------------------------------------------------
-- 8. Review threads (comments, revision requests, decisions, contributor updates)
-- ------------------------------------------------------------------------------
CREATE TABLE review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_wallet VARCHAR(42) NOT NULL,
  author_role VARCHAR(12) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  links TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_review_target CHECK (target_type IN ('submission', 'milestone_submission')),
  CONSTRAINT ck_review_role CHECK (author_role IN ('reviewer', 'contributor')),
  CONSTRAINT ck_review_kind CHECK (kind IN ('comment', 'revision_request', 'approved', 'rejected', 'update', 'reopened'))
);

CREATE INDEX ix_review_target ON review_comments (target_type, target_id, created_at);

-- ------------------------------------------------------------------------------
-- 9. Team coordination (off-chain; the contract pays one wallet per prize place)
-- ------------------------------------------------------------------------------
CREATE TABLE bounty_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet VARCHAR(42) NOT NULL,
  role VARCHAR(80) NOT NULL DEFAULT '',
  responsibility TEXT NOT NULL DEFAULT '',
  share_bps INTEGER,
  status VARCHAR(12) NOT NULL DEFAULT 'requested',
  message VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_team_status CHECK (status IN ('requested', 'active', 'declined', 'left')),
  CONSTRAINT ck_team_share CHECK (share_bps IS NULL OR (share_bps >= 0 AND share_bps <= 10000)),
  CONSTRAINT ux_team_member UNIQUE (bounty_id, wallet)
);

CREATE INDEX ix_team_bounty ON bounty_team_members (bounty_id, status);
CREATE INDEX ix_team_wallet ON bounty_team_members (wallet, status);

-- ------------------------------------------------------------------------------
-- 10. Notifications
-- ------------------------------------------------------------------------------
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  link VARCHAR(200) NOT NULL DEFAULT '',
  dedupe_key VARCHAR(160),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX ux_notifications_dedupe ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

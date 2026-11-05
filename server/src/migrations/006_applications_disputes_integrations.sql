-- ==============================================================================
-- 006: Applications, disputes, integrations, analytics
--   * apply-before-work coordination on bounties
--   * disputes with evidence threads and admin mediation (non-binding)
--   * outbound project webhooks
--   * leaderboard opt-out
-- Application data only. The contract is untouched.
-- ==============================================================================

ALTER TABLE bounties ADD COLUMN accepts_applications BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE bounty_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet VARCHAR(42) NOT NULL,
  message VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'requested',
  decision_note VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_application_status CHECK (status IN ('requested', 'approved', 'declined', 'withdrawn')),
  CONSTRAINT ux_application UNIQUE (bounty_id, wallet)
);

CREATE INDEX ix_applications_bounty ON bounty_applications (bounty_id, status);
CREATE INDEX ix_applications_wallet ON bounty_applications (wallet, status);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(16) NOT NULL,
  summary TEXT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  resolved_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT ck_dispute_reason CHECK (reason IN ('rejected', 'reclaimed', 'no_decision')),
  CONSTRAINT ck_dispute_status CHECK (status IN ('open', 'upheld', 'dismissed', 'settled')),
  CONSTRAINT ux_dispute_submission UNIQUE (submission_id)
);

CREATE INDEX ix_disputes_status ON disputes (status, created_at DESC);
CREATE INDEX ix_disputes_bounty ON disputes (bounty_id);

CREATE TABLE dispute_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_wallet VARCHAR(42),
  author_role VARCHAR(12) NOT NULL,
  body TEXT NOT NULL,
  links TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_dispute_role CHECK (author_role IN ('contributor', 'creator', 'mediator'))
);

CREATE INDEX ix_dispute_comments ON dispute_comments (dispute_id, created_at);

CREATE TABLE project_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  events TEXT[] NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_delivery_at TIMESTAMPTZ,
  last_error VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_project_webhooks_project ON project_webhooks (project_id);

ALTER TABLE contributor_profiles ADD COLUMN hide_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE;

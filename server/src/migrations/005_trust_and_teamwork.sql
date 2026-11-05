-- ==============================================================================
-- 005: Trust and teamwork
--   * GitHub pull request checks on submissions
--   * confidential (encrypted) reports and the creator's encryption key
--   * saved searches with alerts
--   * project members with roles
-- Application data only. The contract, its ABI and the escrow logic are untouched.
-- ==============================================================================

-- GitHub pull request check results (stored, so the GitHub API is called rarely)
ALTER TABLE submissions ADD COLUMN pr_checked_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN pr_state VARCHAR(16);
ALTER TABLE submissions ADD COLUMN pr_merged BOOLEAN;
ALTER TABLE submissions ADD COLUMN pr_author VARCHAR(80);
ALTER TABLE submissions ADD COLUMN pr_title VARCHAR(300);

-- Confidential bounties accept only reports encrypted to the creator's public key
ALTER TABLE bounties ADD COLUMN confidential BOOLEAN NOT NULL DEFAULT FALSE;

-- The private key is wrapped in the browser with a key derived from a wallet signature.
-- The server stores only the public key and the wrapped (encrypted) private key.
CREATE TABLE encryption_keys (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_jwk JSONB NOT NULL,
  wrapped_private TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_url VARCHAR(500),
  last_triggered_at TIMESTAMPTZ,
  last_error VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_saved_searches_user ON saved_searches (user_id, created_at DESC);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet VARCHAR(42) NOT NULL,
  role VARCHAR(12) NOT NULL,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_member_role CHECK (role IN ('manager', 'reviewer')),
  CONSTRAINT ux_project_member UNIQUE (project_id, user_id)
);

CREATE INDEX ix_project_members_user ON project_members (user_id);

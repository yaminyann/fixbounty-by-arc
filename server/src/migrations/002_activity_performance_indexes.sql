-- ==============================================================================
-- 002: Performance Indexes for Dashboard & Activity History
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_activity_user_id ON bounty_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor_wallet ON bounty_activity(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON bounty_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor_created ON bounty_activity(actor_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounties_creator_wallet ON bounties(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_submissions_submitter_wallet ON submissions(submitter_wallet);

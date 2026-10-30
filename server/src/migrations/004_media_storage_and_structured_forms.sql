-- ==============================================================================
-- Migration 004: Persistent Media Storage and Structured Bounty/Submission Forms
-- ==============================================================================

-- 1. Persistent Media Storage Table (Optimized WebP images in PostgreSQL BYTEA)
CREATE TABLE IF NOT EXISTS uploaded_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  uploader_wallet VARCHAR(42),
  original_name VARCHAR(255),
  mime_type VARCHAR(50) NOT NULL DEFAULT 'image/webp',
  data BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_user ON uploaded_images(uploader_user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_images_wallet ON uploaded_images(uploader_wallet);
CREATE INDEX IF NOT EXISTS idx_uploaded_images_created ON uploaded_images(created_at DESC);

-- 2. Extend Bounties with Structured Specifications
ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS objectives TEXT,
  ADD COLUMN IF NOT EXISTS requirements TEXT,
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS eligibility TEXT,
  ADD COLUMN IF NOT EXISTS deliverables TEXT,
  ADD COLUMN IF NOT EXISTS submission_instructions TEXT;

-- 3. Extend Submissions with Structured Solution Details
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS solution_details TEXT;


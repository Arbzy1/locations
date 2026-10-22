-- Auto-delete: keep only the last N years of location history (null keeps everything).
-- user_settings already has FORCE RLS and table GRANTs.

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS retention_years integer;

-- Recorded GPS points (Timeline `timelinePath`) per journey: [[lat, lon, unixSeconds], ...].
-- Existing table GRANTs and FORCE RLS on activities cover the new column.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS path jsonb;

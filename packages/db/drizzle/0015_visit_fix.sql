-- Stay position from recorded GPS fixes (median of timelinePath points during the visit).
-- Existing table GRANTs and FORCE RLS on visits cover the new columns.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS fix_lat real;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS fix_lon real;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS fix_count integer;

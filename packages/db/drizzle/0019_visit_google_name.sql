-- Google's own name for a stay's place, when the export includes it (older Takeout
-- "Semantic Location History"). Per tenant on visits, so FORCE RLS and GRANTs already apply.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS google_name text;

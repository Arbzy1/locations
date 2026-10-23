-- Transport mode detected from GPS fixes (trains Google labelled as driving, etc.).
-- google_mode keeps Google's label when detection changed `mode`; rail_geometry is the
-- line along the tracks. Per tenant on activities, so FORCE RLS and GRANTs already apply.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS google_mode text;
--> statement-breakpoint
ALTER TABLE activities ADD COLUMN IF NOT EXISTS mode_detail jsonb;
--> statement-breakpoint
ALTER TABLE activities ADD COLUMN IF NOT EXISTS rail_geometry jsonb;

-- Real places: one key per stay (Google placeId, else the position snapped to ~100 m).
-- The 0.5 degree `cluster` grid stays as a region rollup. Existing GRANTs and FORCE RLS
-- on visits cover the new column. Re-importing recomputes keys with the app's rounding.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS place_key text;

UPDATE visits
SET place_key = CASE
  WHEN place_id IS NOT NULL AND place_id <> '' THEN 'g:' || place_id
  ELSE 'c:' || to_char(round(lat::numeric, 3), 'FM990.000') || ',' || to_char(round(lon::numeric, 3), 'FM990.000')
END
WHERE place_key IS NULL;

CREATE INDEX IF NOT EXISTS visits_tenant_place_key_idx ON visits (tenant, place_key);

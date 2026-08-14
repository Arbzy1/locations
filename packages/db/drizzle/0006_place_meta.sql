-- Place label extras: favourite, colour token, tags.

ALTER TABLE place_labels ADD COLUMN IF NOT EXISTS favourite boolean NOT NULL DEFAULT false;
ALTER TABLE place_labels ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE place_labels ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

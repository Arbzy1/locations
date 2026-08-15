-- Saved map cameras and optional custom raster XYZ (allowlisted in the Worker).

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS map_bookmarks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS map_tile_dark_url text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS map_tile_light_url text;

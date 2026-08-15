-- Source colour tokens and import chosen-file metadata.

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS chosen_file text;

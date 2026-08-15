-- Import completion mail: skip retries after a successful or skipped notify.

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS notified_at timestamp;

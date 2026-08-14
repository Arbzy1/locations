-- Opt-in monthly recap email: counts only, idempotent per calendar month.

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS monthly_recap_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS monthly_recap_last_ym text;

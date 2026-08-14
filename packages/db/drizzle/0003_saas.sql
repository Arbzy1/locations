-- SaaS tables: billing, settings, place labels, import progress.
-- Idempotent-ish (IF NOT EXISTS).

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS parsed_count integer;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS merge boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS place_labels (
  tenant text NOT NULL,
  place_key text NOT NULL,
  label text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, place_key)
);

CREATE TABLE IF NOT EXISTS user_settings (
  tenant text PRIMARY KEY,
  distance_unit text NOT NULL DEFAULT 'mi',
  timezone text,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  tenant text PRIMARY KEY,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'none',
  price_id text,
  current_period_end timestamp,
  grace_until timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx ON subscriptions (stripe_customer_id);

-- Multi Google-account sources + import jobs + source-scoped location rows

CREATE TABLE IF NOT EXISTS data_sources (
  id text PRIMARY KEY,
  tenant text NOT NULL,
  label text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS data_sources_tenant_label_uidx ON data_sources (tenant, label);
CREATE INDEX IF NOT EXISTS data_sources_tenant_idx ON data_sources (tenant);

CREATE TABLE IF NOT EXISTS import_jobs (
  id text PRIMARY KEY,
  tenant text NOT NULL,
  source_id text NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL,
  error text,
  visit_count integer,
  activity_count integer,
  r2_key text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_jobs_tenant_idx ON import_jobs (tenant);
CREATE INDEX IF NOT EXISTS import_jobs_user_id_idx ON import_jobs (user_id);

ALTER TABLE visits ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_id text;

CREATE INDEX IF NOT EXISTS visits_tenant_source_idx ON visits (tenant, source_id);
CREATE INDEX IF NOT EXISTS activities_tenant_source_idx ON activities (tenant, source_id);

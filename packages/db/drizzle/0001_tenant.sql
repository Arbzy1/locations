-- Tenant isolation for demo + personal datasets on the same site

ALTER TABLE visits ADD COLUMN IF NOT EXISTS tenant text NOT NULL DEFAULT 'personal';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tenant text NOT NULL DEFAULT 'personal';
ALTER TABLE day_stats ADD COLUMN IF NOT EXISTS tenant text NOT NULL DEFAULT 'personal';
ALTER TABLE analytics_cache ADD COLUMN IF NOT EXISTS tenant text NOT NULL DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS visits_tenant_date_idx ON visits (tenant, date);
CREATE INDEX IF NOT EXISTS activities_tenant_date_idx ON activities (tenant, date);

-- day_stats: switch to composite primary key (tenant, date)
ALTER TABLE day_stats DROP CONSTRAINT IF EXISTS day_stats_pkey;
ALTER TABLE day_stats ADD PRIMARY KEY (tenant, date);

-- analytics_cache: composite primary key (tenant, key)
ALTER TABLE analytics_cache DROP CONSTRAINT IF EXISTS analytics_cache_pkey;
ALTER TABLE analytics_cache ADD PRIMARY KEY (tenant, key);

CREATE TABLE IF NOT EXISTS "named_trips" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant" text NOT NULL,
  "name" text NOT NULL,
  "start" text NOT NULL,
  "end" text NOT NULL,
  "dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "named_trips_tenant_idx" ON "named_trips" USING btree ("tenant");

CREATE TABLE IF NOT EXISTS "life_chapters" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant" text NOT NULL,
  "name" text NOT NULL,
  "start" text NOT NULL,
  "end" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "life_chapters_tenant_idx" ON "life_chapters" USING btree ("tenant");

CREATE INDEX IF NOT EXISTS "visits_tenant_cluster_idx" ON "visits" USING btree ("tenant","cluster");

-- FORCE RLS for new tenant tables (documented exception).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['named_trips', 'life_chapters']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant = current_setting(''app.tenant'', true)) WITH CHECK (tenant = current_setting(''app.tenant'', true))',
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END $$;

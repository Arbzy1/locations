CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "visit_count" integer,
  "activity_count" integer,
  "r2_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "export_jobs_tenant_idx" ON "export_jobs" USING btree ("tenant");
CREATE INDEX IF NOT EXISTS "export_jobs_user_id_idx" ON "export_jobs" USING btree ("user_id");

-- FORCE RLS for new tenant tables (documented exception).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['export_jobs']
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

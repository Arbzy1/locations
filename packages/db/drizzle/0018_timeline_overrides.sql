-- The user's own notes and transport-mode fixes for stays and journeys, keyed by start
-- time so they survive a re-import of the same export. Tenant table: FORCE RLS + GRANTs.

CREATE TABLE IF NOT EXISTS "timeline_overrides" (
  "tenant" text NOT NULL,
  "kind" text NOT NULL,
  "item_start" text NOT NULL,
  "note" text,
  "mode" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "timeline_overrides_pk" PRIMARY KEY ("tenant", "kind", "item_start")
);

DO $$
BEGIN
  ALTER TABLE timeline_overrides ENABLE ROW LEVEL SECURITY;
  ALTER TABLE timeline_overrides FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS timeline_overrides_tenant_isolation ON timeline_overrides;
  CREATE POLICY timeline_overrides_tenant_isolation ON timeline_overrides
    USING (tenant = current_setting('app.tenant', true))
    WITH CHECK (tenant = current_setting('app.tenant', true));
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'locations_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE timeline_overrides TO locations_app;
  END IF;
END $$;

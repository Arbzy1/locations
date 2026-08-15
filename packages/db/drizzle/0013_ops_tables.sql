-- Operator flags and audit log. Not tenant tables: ENABLE RLS with USING (true),
-- same pattern as stripe_events. Do not FORCE; do not add a tenant column.
-- Documented exception to generated-only SQL (FORCE/GRANT companion).

CREATE TABLE IF NOT EXISTS "ops_flags" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "updated_by" text
);

CREATE TABLE IF NOT EXISTS "ops_audit" (
  "id" text PRIMARY KEY,
  "actor_user_id" text NOT NULL,
  "action" text NOT NULL,
  "target_user_id" text,
  "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_audit_created_at_idx ON ops_audit ("created_at");
CREATE INDEX IF NOT EXISTS ops_audit_actor_idx ON ops_audit ("actor_user_id");

ALTER TABLE ops_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_flags_app_all ON ops_flags;
CREATE POLICY ops_flags_app_all ON ops_flags USING (true) WITH CHECK (true);

ALTER TABLE ops_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_audit_app_all ON ops_audit;
CREATE POLICY ops_audit_app_all ON ops_audit USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'locations_app') THEN
    RETURN;
  END IF;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ops_flags, ops_audit TO locations_app;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

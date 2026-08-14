-- FORCE ROW LEVEL SECURITY on tenant tables.
-- Documented exception to "no hand-written SQL": Drizzle kit does not emit FORCE.
-- App role should be NOBYPASSRLS. Table owner is still subject to FORCE RLS.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'visits',
    'activities',
    'day_stats',
    'analytics_cache',
    'data_sources',
    'import_jobs',
    'place_labels',
    'user_settings',
    'subscriptions'
  ]
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

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_app_all ON "user";
CREATE POLICY user_app_all ON "user" USING (true) WITH CHECK (true);

ALTER TABLE session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_app_all ON session;
CREATE POLICY session_app_all ON session USING (true) WITH CHECK (true);

ALTER TABLE account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_app_all ON account;
CREATE POLICY account_app_all ON account USING (true) WITH CHECK (true);

ALTER TABLE verification ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verification_app_all ON verification;
CREATE POLICY verification_app_all ON verification USING (true) WITH CHECK (true);

ALTER TABLE route_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS route_cache_app_all ON route_cache;
CREATE POLICY route_cache_app_all ON route_cache USING (true) WITH CHECK (true);

ALTER TABLE place_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS place_cache_app_all ON place_cache;
CREATE POLICY place_cache_app_all ON place_cache USING (true) WITH CHECK (true);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stripe_events_app_all ON stripe_events;
CREATE POLICY stripe_events_app_all ON stripe_events USING (true) WITH CHECK (true);

-- Optional dedicated app role (ignore if not permitted on Neon).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'locations_app') THEN
    CREATE ROLE locations_app NOBYPASSRLS NOSUPERUSER LOGIN;
  ELSE
    ALTER ROLE locations_app NOBYPASSRLS;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

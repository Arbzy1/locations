-- FORCE RLS + GRANTs for journey cost (Brim) tables.
-- Documented exception to generated-only SQL (same as 0004_rls.sql / 0012_rls_grants.sql).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brim_vehicles',
    'brim_tariffs',
    'brim_calibrations',
    'brim_fill_ups',
    'brim_journeys',
    'brim_settings',
    'brim_saved_places'
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

-- Shared reference data: ENABLE with USING (true), same as route_cache / place_cache.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brim_stations',
    'brim_station_prices',
    'brim_zones',
    'brim_tolls',
    'brim_vca_vehicles',
    'brim_grid_intensity',
    'brim_route_cache',
    'brim_ingestion_state'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_app_all', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (true) WITH CHECK (true)', t || '_app_all', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'locations_app') THEN
    RETURN;
  END IF;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    brim_vehicles,
    brim_tariffs,
    brim_calibrations,
    brim_fill_ups,
    brim_journeys,
    brim_settings,
    brim_saved_places,
    brim_stations,
    brim_station_prices,
    brim_zones,
    brim_tolls,
    brim_vca_vehicles,
    brim_grid_intensity,
    brim_route_cache,
    brim_ingestion_state
    TO locations_app;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

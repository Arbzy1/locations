-- Sequence GRANTs, table GRANT catch-up, and legacy pre-tenant index cleanup.
-- Documented custom RLS/GRANT migration (same pattern as 0004_rls.sql, 0012_rls_grants.sql, 0021_brim_rls.sql).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'locations_app') THEN
    GRANT USAGE ON SCHEMA public TO locations_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO locations_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO locations_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      timeline_overrides,
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
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

DROP INDEX IF EXISTS visits_date_idx, activities_date_idx;

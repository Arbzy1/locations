-- Table GRANTs for the NOBYPASSRLS app role. Documented exception with 0004_rls.sql.
-- Worker DATABASE_URL should be locations_app; owner BYPASSRLS URLs skip FORCE RLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'locations_app') THEN
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO locations_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    visits,
    activities,
    day_stats,
    analytics_cache,
    data_sources,
    import_jobs,
    export_jobs,
    place_labels,
    user_settings,
    subscriptions,
    named_trips,
    life_chapters,
    "user",
    session,
    account,
    verification,
    route_cache,
    place_cache,
    stripe_events
    TO locations_app;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

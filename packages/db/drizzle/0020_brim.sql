-- Journey cost (Brim) tables. Tenant tables carry `tenant` (session tenant via
-- tenantForUser); reference tables are shared non-PII data.
-- PostGIS backs the clean-air-zone, toll, and forecourt geography columns.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS "brim_vehicles" (
  "id" text PRIMARY KEY,
  "tenant" text NOT NULL,
  "nickname" text,
  "kind" text NOT NULL CHECK ("kind" IN ('car', 'van', 'motorcycle')),
  "propulsion" text NOT NULL CHECK ("propulsion" IN ('petrol', 'diesel', 'hybrid', 'phev', 'bev')),
  "make" text,
  "model" text,
  "derivative" text,
  "transmission" text,
  "year" integer,
  "engine_cc" integer,
  "co2_gkm" integer,
  "euro_status" text,
  "euro_status_source" text CHECK ("euro_status_source" IN ('dvla', 'derived')),
  "official_consumption" double precision,
  "official_unit" text,
  "official_cycle" text,
  "tank_litres" double precision,
  "battery_kwh_usable" double precision,
  "has_heat_pump" boolean,
  "vca_match_id" text,
  "vrm_encrypted" text,
  "vrm_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "brim_vehicles_tenant_idx" ON "brim_vehicles" ("tenant");

CREATE TABLE IF NOT EXISTS "brim_tariffs" (
  "id" text PRIMARY KEY,
  "tenant" text NOT NULL,
  "vehicle_id" text NOT NULL REFERENCES "brim_vehicles"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('home', 'public')),
  "pence_per_kwh" double precision NOT NULL,
  "offpeak_pence" double precision,
  "offpeak_window" text,
  "network" text,
  "is_default" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "brim_tariffs_tenant_vehicle_idx" ON "brim_tariffs" ("tenant", "vehicle_id");

CREATE TABLE IF NOT EXISTS "brim_calibrations" (
  "id" text PRIMARY KEY,
  "tenant" text NOT NULL,
  "vehicle_id" text NOT NULL REFERENCES "brim_vehicles"("id") ON DELETE CASCADE,
  "calculated_value" double precision NOT NULL,
  "unit" text NOT NULL,
  "sample_count" integer NOT NULL,
  "stddev" double precision,
  "last_computed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "brim_calibrations_tenant_vehicle_idx" ON "brim_calibrations" ("tenant", "vehicle_id");

CREATE TABLE IF NOT EXISTS "brim_fill_ups" (
  "id" text PRIMARY KEY,
  "tenant" text NOT NULL,
  "vehicle_id" text NOT NULL REFERENCES "brim_vehicles"("id") ON DELETE CASCADE,
  "odometer_miles" double precision NOT NULL,
  "quantity" double precision NOT NULL,
  "unit" text NOT NULL CHECK ("unit" IN ('litres', 'kwh')),
  "price_pence" integer NOT NULL,
  "station_id" text,
  "filled_to_brim" boolean NOT NULL DEFAULT false,
  "occurred_at" timestamptz NOT NULL,
  "note" text
);
CREATE INDEX IF NOT EXISTS "brim_fill_ups_tenant_vehicle_idx" ON "brim_fill_ups" ("tenant", "vehicle_id");

CREATE TABLE IF NOT EXISTS "brim_journeys" (
  "id" text PRIMARY KEY,
  "tenant" text NOT NULL,
  "vehicle_id" text,
  "origin_label" text NOT NULL,
  "dest_label" text NOT NULL,
  "distance_meters" double precision NOT NULL,
  "duration_seconds" double precision NOT NULL,
  "polyline" text,
  "departs_at" timestamptz,
  "estimate_json" jsonb NOT NULL,
  "charges_json" jsonb NOT NULL,
  "is_saved" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "brim_journeys_tenant_created_idx" ON "brim_journeys" ("tenant", "created_at");

CREATE TABLE IF NOT EXISTS "brim_settings" (
  "tenant" text PRIMARY KEY,
  "default_vehicle_id" text REFERENCES "brim_vehicles"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "brim_saved_places" (
  "id" text PRIMARY KEY,
  "tenant" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('home', 'work', 'favourite')),
  "label" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "brim_saved_places_one_home_work"
  ON "brim_saved_places" ("tenant", "kind") WHERE "kind" IN ('home', 'work');
CREATE INDEX IF NOT EXISTS "brim_saved_places_tenant_idx" ON "brim_saved_places" ("tenant");

CREATE TABLE IF NOT EXISTS "brim_stations" (
  "id" text PRIMARY KEY,
  "brand" text,
  "brand_canonical" text,
  "name" text NOT NULL,
  "address" text,
  "postcode" text,
  "location" geography(Point, 4326),
  "opening_hours_json" jsonb,
  "last_seen_at" timestamptz,
  "is_stale" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "brim_stations_location_gix" ON "brim_stations" USING GIST ("location");

CREATE TABLE IF NOT EXISTS "brim_station_prices" (
  "station_id" text NOT NULL REFERENCES "brim_stations"("id") ON DELETE CASCADE,
  "grade" text NOT NULL CHECK ("grade" IN ('E10', 'E5', 'B7', 'SDV', 'LPG')),
  "price_tenths_pence" integer NOT NULL,
  "observed_at" timestamptz NOT NULL,
  "raw_payload_json" jsonb,
  PRIMARY KEY ("station_id", "grade")
);

CREATE TABLE IF NOT EXISTS "brim_zones" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "authority" text,
  "kind" text NOT NULL CHECK ("kind" IN ('caz', 'ulez', 'congestion', 'lez')),
  "caz_class" text,
  "charge_pence" integer,
  "is_restriction" boolean NOT NULL DEFAULT false,
  "applies_hours_json" jsonb,
  "geometry" geography(MultiPolygon, 4326),
  "source_url" text,
  "operator_url" text,
  "verified_on" date,
  "dataset_version" text
);
CREATE INDEX IF NOT EXISTS "brim_zones_geometry_gix" ON "brim_zones" USING GIST ("geometry");

CREATE TABLE IF NOT EXISTS "brim_tolls" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "operator" text,
  "location" geography,
  "charge_pence_by_class_json" jsonb,
  "applies_hours_json" jsonb,
  "source_url" text,
  "operator_url" text,
  "verified_on" date
);
CREATE INDEX IF NOT EXISTS "brim_tolls_location_gix" ON "brim_tolls" USING GIST ("location");

CREATE TABLE IF NOT EXISTS "brim_vca_vehicles" (
  "id" text PRIMARY KEY,
  "make" text NOT NULL,
  "model" text NOT NULL,
  "derivative" text,
  "fuel" text,
  "engine_cc" integer,
  "transmission" text,
  "co2_gkm" integer,
  "consumption_combined" double precision,
  "unit" text,
  "cycle" text,
  "dataset_version" text
);
CREATE INDEX IF NOT EXISTS "brim_vca_vehicles_make_model_idx" ON "brim_vca_vehicles" ("make", "model");

CREATE TABLE IF NOT EXISTS "brim_grid_intensity" (
  "region" text NOT NULL,
  "intensity_g_per_kwh" double precision NOT NULL,
  "valid_from" timestamptz NOT NULL,
  "valid_to" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "brim_grid_intensity_region_from_uidx" ON "brim_grid_intensity" ("region", "valid_from");

CREATE TABLE IF NOT EXISTS "brim_route_cache" (
  "cache_key" text PRIMARY KEY,
  "provider" text NOT NULL,
  "response_json" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "brim_ingestion_state" (
  "source" text PRIMARY KEY,
  "watermark" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

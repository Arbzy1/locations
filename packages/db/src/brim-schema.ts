/**
 * Journey cost (Brim) tables. Tenant tables carry `tenant` and FORCE RLS like
 * the rest of Locations; reference tables (stations, zones, tolls, VCA, grid)
 * are shared non-PII data, same pattern as `route_cache`.
 *
 * PostGIS columns (`brim_stations.location`, `brim_zones.geometry`,
 * `brim_tolls.location`) stay off the object mapper. They are written and read
 * with ST_* SQL in the API and sync scripts.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ─── Tenant-scoped ─── */

export const brimVehicles = pgTable(
  "brim_vehicles",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    nickname: text("nickname"),
    kind: text("kind").notNull(),
    propulsion: text("propulsion").notNull(),
    make: text("make"),
    model: text("model"),
    derivative: text("derivative"),
    transmission: text("transmission"),
    year: integer("year"),
    engineCc: integer("engine_cc"),
    co2Gkm: integer("co2_gkm"),
    euroStatus: text("euro_status"),
    euroStatusSource: text("euro_status_source"),
    officialConsumption: doublePrecision("official_consumption"),
    officialUnit: text("official_unit"),
    officialCycle: text("official_cycle"),
    tankLitres: doublePrecision("tank_litres"),
    batteryKwhUsable: doublePrecision("battery_kwh_usable"),
    hasHeatPump: boolean("has_heat_pump"),
    vcaMatchId: text("vca_match_id"),
    vrmEncrypted: text("vrm_encrypted"),
    vrmHash: text("vrm_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brim_vehicles_tenant_idx").on(t.tenant)],
);

export const brimTariffs = pgTable(
  "brim_tariffs",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    vehicleId: text("vehicle_id").notNull(),
    kind: text("kind").notNull(),
    pencePerKwh: doublePrecision("pence_per_kwh").notNull(),
    offpeakPence: doublePrecision("offpeak_pence"),
    offpeakWindow: text("offpeak_window"),
    network: text("network"),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [index("brim_tariffs_tenant_vehicle_idx").on(t.tenant, t.vehicleId)],
);

export const brimCalibrations = pgTable(
  "brim_calibrations",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    vehicleId: text("vehicle_id").notNull(),
    calculatedValue: doublePrecision("calculated_value").notNull(),
    unit: text("unit").notNull(),
    sampleCount: integer("sample_count").notNull(),
    stddev: doublePrecision("stddev"),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brim_calibrations_tenant_vehicle_idx").on(t.tenant, t.vehicleId)],
);

export const brimFillUps = pgTable(
  "brim_fill_ups",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    vehicleId: text("vehicle_id").notNull(),
    odometerMiles: doublePrecision("odometer_miles").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unit: text("unit").notNull(),
    pricePence: integer("price_pence").notNull(),
    stationId: text("station_id"),
    filledToBrim: boolean("filled_to_brim").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
  },
  (t) => [index("brim_fill_ups_tenant_vehicle_idx").on(t.tenant, t.vehicleId)],
);

export const brimJourneys = pgTable(
  "brim_journeys",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    vehicleId: text("vehicle_id"),
    originLabel: text("origin_label").notNull(),
    destLabel: text("dest_label").notNull(),
    distanceMeters: doublePrecision("distance_meters").notNull(),
    durationSeconds: doublePrecision("duration_seconds").notNull(),
    polyline: text("polyline"),
    departsAt: timestamp("departs_at", { withTimezone: true }),
    estimateJson: jsonb("estimate_json").notNull(),
    chargesJson: jsonb("charges_json").notNull(),
    isSaved: boolean("is_saved").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brim_journeys_tenant_created_idx").on(t.tenant, t.createdAt)],
);

export const brimSettings = pgTable("brim_settings", {
  tenant: text("tenant").primaryKey(),
  defaultVehicleId: text("default_vehicle_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brimSavedPlaces = pgTable(
  "brim_saved_places",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("brim_saved_places_one_home_work")
      .on(t.tenant, t.kind)
      .where(sql`kind IN ('home', 'work')`),
    index("brim_saved_places_tenant_idx").on(t.tenant),
  ],
);

/* ─── Shared reference data (non-PII) ─── */

export const brimStations = pgTable("brim_stations", {
  id: text("id").primaryKey(),
  brand: text("brand"),
  brandCanonical: text("brand_canonical"),
  name: text("name").notNull(),
  address: text("address"),
  postcode: text("postcode"),
  openingHoursJson: jsonb("opening_hours_json"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  isStale: boolean("is_stale").notNull().default(false),
});

export const brimStationPrices = pgTable(
  "brim_station_prices",
  {
    stationId: text("station_id").notNull(),
    grade: text("grade").notNull(),
    priceTenthsPence: integer("price_tenths_pence").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    rawPayloadJson: jsonb("raw_payload_json"),
  },
  (t) => [primaryKey({ columns: [t.stationId, t.grade] })],
);

export const brimZones = pgTable("brim_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  authority: text("authority"),
  kind: text("kind").notNull(),
  cazClass: text("caz_class"),
  chargePence: integer("charge_pence"),
  isRestriction: boolean("is_restriction").notNull().default(false),
  appliesHoursJson: jsonb("applies_hours_json"),
  sourceUrl: text("source_url"),
  operatorUrl: text("operator_url"),
  verifiedOn: date("verified_on"),
  datasetVersion: text("dataset_version"),
});

export const brimTolls = pgTable("brim_tolls", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  operator: text("operator"),
  chargePenceByClassJson: jsonb("charge_pence_by_class_json"),
  appliesHoursJson: jsonb("applies_hours_json"),
  sourceUrl: text("source_url"),
  operatorUrl: text("operator_url"),
  verifiedOn: date("verified_on"),
});

export const brimVcaVehicles = pgTable(
  "brim_vca_vehicles",
  {
    id: text("id").primaryKey(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    derivative: text("derivative"),
    fuel: text("fuel"),
    engineCc: integer("engine_cc"),
    transmission: text("transmission"),
    co2Gkm: integer("co2_gkm"),
    consumptionCombined: doublePrecision("consumption_combined"),
    unit: text("unit"),
    cycle: text("cycle"),
    datasetVersion: text("dataset_version"),
  },
  (t) => [index("brim_vca_vehicles_make_model_idx").on(t.make, t.model)],
);

export const brimGridIntensity = pgTable(
  "brim_grid_intensity",
  {
    region: text("region").notNull(),
    intensityGPerKwh: doublePrecision("intensity_g_per_kwh").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("brim_grid_intensity_region_from_uidx").on(t.region, t.validFrom)],
);

/** Routing provider responses keyed by a hash of the request. Shared, like `route_cache`. */
export const brimRouteCache = pgTable("brim_route_cache", {
  cacheKey: text("cache_key").primaryKey(),
  provider: text("provider").notNull(),
  responseJson: jsonb("response_json").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const brimIngestionState = pgTable("brim_ingestion_state", {
  source: text("source").primaryKey(),
  watermark: timestamp("watermark", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrimVehicleRow = typeof brimVehicles.$inferSelect;
export type BrimTariffRow = typeof brimTariffs.$inferSelect;
export type BrimCalibrationRow = typeof brimCalibrations.$inferSelect;
export type BrimFillUpRow = typeof brimFillUps.$inferSelect;
export type BrimJourneyRow = typeof brimJourneys.$inferSelect;
export type BrimSettingsRow = typeof brimSettings.$inferSelect;
export type BrimSavedPlaceRow = typeof brimSavedPlaces.$inferSelect;

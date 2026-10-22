export const STATION_UPSERT_SQL = `
INSERT INTO brim_stations (
  id, brand, brand_canonical, name, address, postcode, location,
  opening_hours_json, last_seen_at, is_stale
) VALUES (
  $1, $2, $3, $4, $5, $6,
  ST_SetSRID(ST_MakePoint($7::float8, $8::float8), 4326)::geography,
  $9::jsonb, $10::timestamptz, $11::boolean
)
ON CONFLICT (id) DO UPDATE SET
  brand = EXCLUDED.brand,
  brand_canonical = EXCLUDED.brand_canonical,
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  postcode = EXCLUDED.postcode,
  location = EXCLUDED.location,
  opening_hours_json = EXCLUDED.opening_hours_json,
  last_seen_at = EXCLUDED.last_seen_at,
  is_stale = EXCLUDED.is_stale
`;

export const PRICE_UPSERT_SQL = `
INSERT INTO brim_station_prices (station_id, grade, price_tenths_pence, observed_at, raw_payload_json)
VALUES ($1, $2, $3, $4::timestamptz, $5::jsonb)
ON CONFLICT (station_id, grade) DO UPDATE SET
  price_tenths_pence = EXCLUDED.price_tenths_pence,
  observed_at = EXCLUDED.observed_at,
  raw_payload_json = EXCLUDED.raw_payload_json
`;

export const WATERMARK_SELECT_SQL = `SELECT watermark FROM brim_ingestion_state WHERE source = $1`;

export const WATERMARK_UPSERT_SQL = `
INSERT INTO brim_ingestion_state (source, watermark, updated_at)
VALUES ($1, $2::timestamptz, $3::timestamptz)
ON CONFLICT (source) DO UPDATE SET
  watermark = EXCLUDED.watermark,
  updated_at = EXCLUDED.updated_at
`;

export const STALE_SWEEP_SQL = `
UPDATE brim_stations SET is_stale = true
WHERE last_seen_at IS NOT NULL
  AND last_seen_at < $1::timestamptz
  AND is_stale = false
`;

export const FUEL_FINDER_SOURCE = "fuel-finder";

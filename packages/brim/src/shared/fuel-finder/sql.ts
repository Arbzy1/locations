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
  last_seen_at = GREATEST(COALESCE(brim_stations.last_seen_at, EXCLUDED.last_seen_at), EXCLUDED.last_seen_at),
  is_stale = EXCLUDED.is_stale
`;

export const STATION_BATCH_UPSERT_SQL = `
INSERT INTO brim_stations (
  id, brand, brand_canonical, name, address, postcode, location,
  opening_hours_json, last_seen_at, is_stale
)
SELECT
  t.id,
  t.brand,
  t.brand_canonical,
  t.name,
  t.address,
  t.postcode,
  ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography,
  t.opening_hours_json,
  t.last_seen_at,
  t.is_stale
FROM UNNEST(
  $1::text[],
  $2::text[],
  $3::text[],
  $4::text[],
  $5::text[],
  $6::text[],
  $7::float8[],
  $8::float8[],
  $9::jsonb[],
  $10::timestamptz[],
  $11::boolean[]
) AS t(
  id, brand, brand_canonical, name, address, postcode,
  lng, lat, opening_hours_json, last_seen_at, is_stale
)
ON CONFLICT (id) DO UPDATE SET
  brand = EXCLUDED.brand,
  brand_canonical = EXCLUDED.brand_canonical,
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  postcode = EXCLUDED.postcode,
  location = EXCLUDED.location,
  opening_hours_json = EXCLUDED.opening_hours_json,
  last_seen_at = GREATEST(COALESCE(brim_stations.last_seen_at, EXCLUDED.last_seen_at), EXCLUDED.last_seen_at),
  is_stale = EXCLUDED.is_stale
`;

export const PRICE_UPSERT_SQL = `
WITH upserted AS (
  INSERT INTO brim_station_prices (station_id, grade, price_tenths_pence, observed_at, raw_payload_json)
  SELECT $1::text, $2::text, $3::int4, $4::timestamptz, $5::jsonb
  WHERE EXISTS (SELECT 1 FROM brim_stations s WHERE s.id = $1::text)
  ON CONFLICT (station_id, grade) DO UPDATE SET
    price_tenths_pence = EXCLUDED.price_tenths_pence,
    observed_at = EXCLUDED.observed_at,
    raw_payload_json = EXCLUDED.raw_payload_json
  RETURNING station_id, observed_at
)
UPDATE brim_stations s
SET
  last_seen_at = GREATEST(COALESCE(s.last_seen_at, u.observed_at), u.observed_at),
  is_stale = false
FROM upserted u
WHERE s.id = u.station_id
`;

export const PRICE_BATCH_UPSERT_SQL = `
WITH incoming AS (
  SELECT * FROM UNNEST(
    $1::text[],
    $2::text[],
    $3::int4[],
    $4::timestamptz[],
    $5::jsonb[]
  ) AS t(station_id, grade, price_tenths_pence, observed_at, raw_payload_json)
),
valid AS (
  SELECT i.station_id, i.grade, i.price_tenths_pence, i.observed_at, i.raw_payload_json
  FROM incoming i
  WHERE EXISTS (SELECT 1 FROM brim_stations s WHERE s.id = i.station_id)
),
upserted AS (
  INSERT INTO brim_station_prices (station_id, grade, price_tenths_pence, observed_at, raw_payload_json)
  SELECT station_id, grade, price_tenths_pence, observed_at, raw_payload_json
  FROM valid
  ON CONFLICT (station_id, grade) DO UPDATE SET
    price_tenths_pence = EXCLUDED.price_tenths_pence,
    observed_at = EXCLUDED.observed_at,
    raw_payload_json = EXCLUDED.raw_payload_json
  RETURNING station_id, observed_at
),
latest_per_station AS (
  SELECT station_id, MAX(observed_at) AS max_observed_at
  FROM upserted
  GROUP BY station_id
)
UPDATE brim_stations s
SET
  last_seen_at = GREATEST(COALESCE(s.last_seen_at, l.max_observed_at), l.max_observed_at),
  is_stale = false
FROM latest_per_station l
WHERE s.id = l.station_id
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

export const CARBON_INTENSITY_SOURCE = "carbon-intensity";

export const GRID_INTENSITY_UPSERT_SQL = `
INSERT INTO brim_grid_intensity (region, intensity_g_per_kwh, valid_from, valid_to)
VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
ON CONFLICT (region, valid_from) DO UPDATE SET
  intensity_g_per_kwh = EXCLUDED.intensity_g_per_kwh,
  valid_to = EXCLUDED.valid_to
`;

export const GRID_INTENSITY_LOOKUP_SQL = `
SELECT region, intensity_g_per_kwh, valid_from, valid_to
FROM brim_grid_intensity
WHERE region = $1
  AND valid_from <= $2::timestamptz
  AND valid_to > $2::timestamptz
LIMIT 1
`;

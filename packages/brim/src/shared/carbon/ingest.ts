import { CARBON_INTENSITY_SOURCE, GRID_INTENSITY_UPSERT_SQL } from "./sql.js";
import { WATERMARK_UPSERT_SQL } from "../fuel-finder/sql.js";
import type { CarbonIntensityPeriod } from "./types.js";

export type SqlQuery = (sql: string, params: unknown[]) => Promise<unknown>;

export async function persistCarbonIntensity(
  query: SqlQuery,
  periods: CarbonIntensityPeriod[],
  nowIso: string,
): Promise<{ rows: number }> {
  for (const row of periods) {
    await query(GRID_INTENSITY_UPSERT_SQL, [
      row.region,
      row.intensityGPerKwh,
      row.validFrom,
      row.validTo,
    ]);
  }
  await query(WATERMARK_UPSERT_SQL, [CARBON_INTENSITY_SOURCE, nowIso, nowIso]);
  return { rows: periods.length };
}

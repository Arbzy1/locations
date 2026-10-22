import { STALE_AFTER_MS } from "./normalise.js";
import type { FuelFinderNormaliseResult } from "./types.js";
import {
  FUEL_FINDER_SOURCE,
  PRICE_UPSERT_SQL,
  STALE_SWEEP_SQL,
  STATION_UPSERT_SQL,
  WATERMARK_UPSERT_SQL,
} from "./sql.js";

export type SqlQuery = (sql: string, params: unknown[]) => Promise<unknown>;

export async function persistFuelFinder(
  query: SqlQuery,
  result: FuelFinderNormaliseResult,
  nowIso: string,
): Promise<{ stations: number; prices: number }> {
  for (const station of result.stations) {
    await query(STATION_UPSERT_SQL, [
      station.id,
      station.brand ?? null,
      station.brandCanonical,
      station.name,
      station.address ?? null,
      station.postcode ?? null,
      station.lng,
      station.lat,
      station.openingHoursJson ? JSON.stringify(station.openingHoursJson) : null,
      station.lastSeenAt ?? nowIso,
      station.isStale,
    ]);
  }
  for (const price of result.prices) {
    await query(PRICE_UPSERT_SQL, [
      price.stationId,
      price.grade,
      price.priceTenthsPence,
      price.observedAt,
      JSON.stringify(price.rawPayloadJson),
    ]);
  }
  const cutoff = new Date(Date.parse(nowIso) - STALE_AFTER_MS).toISOString();
  await query(STALE_SWEEP_SQL, [cutoff]);
  await query(WATERMARK_UPSERT_SQL, [FUEL_FINDER_SOURCE, nowIso, nowIso]);
  return { stations: result.stations.length, prices: result.prices.length };
}

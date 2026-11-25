import { STALE_AFTER_MS } from "./normalise.js";
import type { FuelFinderNormaliseResult, NormalisedPrice, NormalisedStation } from "./types.js";
import {
  FUEL_FINDER_SOURCE,
  PRICE_BATCH_UPSERT_SQL,
  STALE_SWEEP_SQL,
  STATION_BATCH_UPSERT_SQL,
  WATERMARK_UPSERT_SQL,
} from "./sql.js";

export type SqlQuery = (sql: string, params: unknown[]) => Promise<unknown>;

export const FUEL_FINDER_BATCH_SIZE = 500;

function dedupeStationsForBatch(stations: NormalisedStation[]): NormalisedStation[] {
  const byId = new Map<string, NormalisedStation>();
  for (const s of stations) {
    byId.set(s.id, s);
  }
  return [...byId.values()];
}

function dedupePricesForBatch(prices: NormalisedPrice[]): NormalisedPrice[] {
  const byKey = new Map<string, NormalisedPrice>();
  for (const p of prices) {
    const key = `${p.stationId}|${p.grade}`;
    const prev = byKey.get(key);
    if (!prev || Date.parse(p.observedAt) >= Date.parse(prev.observedAt)) {
      byKey.set(key, p);
    }
  }
  return [...byKey.values()];
}

export async function persistFuelFinder(
  query: SqlQuery,
  result: FuelFinderNormaliseResult,
  nowIso: string,
): Promise<{ stations: number; prices: number }> {
  const uniqueStations = dedupeStationsForBatch(result.stations);
  for (let i = 0; i < uniqueStations.length; i += FUEL_FINDER_BATCH_SIZE) {
    const chunk = uniqueStations.slice(i, i + FUEL_FINDER_BATCH_SIZE);
    await query(STATION_BATCH_UPSERT_SQL, [
      chunk.map((s) => s.id),
      chunk.map((s) => s.brand ?? null),
      chunk.map((s) => s.brandCanonical),
      chunk.map((s) => s.name),
      chunk.map((s) => s.address ?? null),
      chunk.map((s) => s.postcode ?? null),
      chunk.map((s) => s.lng),
      chunk.map((s) => s.lat),
      chunk.map((s) => (s.openingHoursJson !== undefined ? JSON.stringify(s.openingHoursJson) : null)),
      chunk.map((s) => s.lastSeenAt ?? nowIso),
      chunk.map((s) => s.isStale),
    ]);
  }

  const uniquePrices = dedupePricesForBatch(result.prices);
  for (let i = 0; i < uniquePrices.length; i += FUEL_FINDER_BATCH_SIZE) {
    const chunk = uniquePrices.slice(i, i + FUEL_FINDER_BATCH_SIZE);
    await query(PRICE_BATCH_UPSERT_SQL, [
      chunk.map((p) => p.stationId),
      chunk.map((p) => p.grade),
      chunk.map((p) => p.priceTenthsPence),
      chunk.map((p) => p.observedAt),
      chunk.map((p) => JSON.stringify(p.rawPayloadJson ?? null)),
    ]);
  }

  const cutoff = new Date(Date.parse(nowIso) - STALE_AFTER_MS).toISOString();
  await query(STALE_SWEEP_SQL, [cutoff]);
  await query(WATERMARK_UPSERT_SQL, [FUEL_FINDER_SOURCE, nowIso, nowIso]);
  return { stations: uniqueStations.length, prices: uniquePrices.length };
}

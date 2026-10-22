import { distanceMeters } from "../places.js";
import { median, newestIso } from "./median.js";
import { tenthsToPpl } from "./price.js";
import type { FuelGrade, PriceObservation, ResolvedFuelPrice } from "./types.js";

export const HOME_AREA_METERS = 16093.44;
export const HARDCODED_FALLBACK_PPL = 140;
export const HARDCODED_FALLBACK_ISO = "1970-01-01T00:00:00Z";

function fresh(rows: PriceObservation[], grade: FuelGrade): PriceObservation[] {
  return rows.filter((row) => row.grade === grade && !row.isStale);
}

function fromSamples(
  samples: PriceObservation[],
  source: ResolvedFuelPrice["source"],
  reason: string,
  stationId?: string,
): ResolvedFuelPrice | undefined {
  const tenths = median(samples.map((s) => s.priceTenthsPence));
  const observedAt = newestIso(samples.map((s) => s.observedAt));
  if (tenths === undefined || !observedAt) return undefined;
  const resolved: ResolvedFuelPrice = {
    pence: tenthsToPpl(tenths),
    source,
    observedAt,
    reason,
  };
  if (stationId) resolved.stationId = stationId;
  return resolved;
}

function fallback(): ResolvedFuelPrice {
  return {
    pence: HARDCODED_FALLBACK_PPL,
    source: "hardcoded-fallback",
    observedAt: HARDCODED_FALLBACK_ISO,
    reason: "Price data unavailable, so we used 140 ppl.",
    warning: {
      code: "price-data-unavailable",
      message: "Price data unavailable.",
      severity: "warning",
    },
  };
}

export function resolveIcePrice(input: {
  grade: FuelGrade;
  observations: PriceObservation[];
  stationId?: string;
  origin?: { lat: number; lng: number };
}): ResolvedFuelPrice {
  const rows = fresh(input.observations, input.grade);

  if (input.stationId) {
    const picked = rows.filter((row) => row.stationId === input.stationId);
    const hit = fromSamples(
      picked,
      "user-picked-station",
      `Used the ${input.grade} price at the forecourt you picked.`,
      input.stationId,
    );
    if (hit) return hit;
  }

  if (input.origin) {
    const nearby = rows.filter(
      (row) => distanceMeters(input.origin!, { lat: row.lat, lng: row.lng }) <= HOME_AREA_METERS,
    );
    const hit = fromSamples(
      nearby,
      "home-area-median",
      `Used the median ${input.grade} price within 10 miles of the start.`,
    );
    if (hit) return hit;
  }

  const national = fromSamples(
    rows,
    "national-median",
    `Used the national median ${input.grade} price.`,
  );
  if (national) return national;

  return fallback();
}

/** Home-area or national median only. Never the 140 ppl fallback. */
export function resolveFillBaseline(input: {
  grade: FuelGrade;
  observations: PriceObservation[];
  origin?: { lat: number; lng: number };
}): ResolvedFuelPrice | undefined {
  const resolved = resolveIcePrice(input);
  if (resolved.source === "hardcoded-fallback") return undefined;
  return resolved;
}

export function observationsFromNormalised(
  stations: Array<{ id: string; lat: number; lng: number; isStale: boolean }>,
  prices: Array<{
    stationId: string;
    grade: FuelGrade;
    priceTenthsPence: number;
    observedAt: string;
  }>,
): PriceObservation[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const out: PriceObservation[] = [];
  for (const price of prices) {
    const station = byId.get(price.stationId);
    if (!station) continue;
    out.push({
      stationId: price.stationId,
      grade: price.grade,
      priceTenthsPence: price.priceTenthsPence,
      observedAt: price.observedAt,
      lat: station.lat,
      lng: station.lng,
      isStale: station.isStale,
    });
  }
  return out;
}

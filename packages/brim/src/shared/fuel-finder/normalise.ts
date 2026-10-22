import { distanceMeters } from "../places.js";
import { canonicalBrand } from "./brands.js";
import { mapFuelFinderGrade } from "./grades.js";
import { parsePriceToPpl, pplToTenths } from "./price.js";
import type {
  FuelFinderNormaliseResult,
  FuelFinderPfs,
  FuelFinderPriceRow,
  FuelFinderSkip,
  NormalisedPrice,
  NormalisedStation,
} from "./types.js";

export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
export const DEDUPE_METERS = 50;

export function isStaleAt(iso: string | undefined, nowIso: string): boolean {
  if (!iso) return false;
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return false;
  return now - then > STALE_AFTER_MS;
}

function parseCoord(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : undefined;
}

function asIso(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  }
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return fallback;
}

function joinAddress(loc: NonNullable<FuelFinderPfs["location"]>): string | undefined {
  const parts = [loc.address_line_1, loc.address_line_2, loc.city].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  if (parts.length === 0) return undefined;
  return parts.join(", ");
}

export function normalisePfs(row: FuelFinderPfs, nowIso: string): NormalisedStation | FuelFinderSkip {
  const id = row.node_id?.trim();
  if (!id) return { reason: "missing-node-id" };
  const lat = parseCoord(row.location?.latitude);
  const lng = parseCoord(row.location?.longitude);
  if (lat === undefined || lng === undefined || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { reason: "missing-coordinates", nodeId: id };
  }
  const name = row.trading_name?.trim() || row.brand_name?.trim() || "Forecourt";
  const brand = row.brand_name?.trim();
  const address = row.location ? joinAddress(row.location) : undefined;
  const postcode = row.location?.postcode?.trim();
  const station: NormalisedStation = {
    id,
    brandCanonical: canonicalBrand(brand),
    name,
    lat,
    lng,
    isStale: row.permanent_closure === true,
    lastSeenAt: nowIso,
  };
  if (brand) station.brand = brand;
  if (address) station.address = address;
  if (postcode) station.postcode = postcode;
  if (row.opening_times !== undefined) station.openingHoursJson = row.opening_times;
  return station;
}

export function normalisePrices(
  row: FuelFinderPriceRow,
  nowIso: string,
): { prices: NormalisedPrice[]; skipped: FuelFinderSkip[]; lastSeenAt?: string } {
  const id = row.node_id?.trim();
  if (!id) return { prices: [], skipped: [{ reason: "missing-node-id" }] };
  const prices: NormalisedPrice[] = [];
  const skipped: FuelFinderSkip[] = [];
  let lastSeenAt: string | undefined;
  for (const entry of row.fuel_prices ?? []) {
    const fuelType = entry.fuel_type?.trim();
    const grade = mapFuelFinderGrade(entry.fuel_type);
    if (!grade) {
      const skip: FuelFinderSkip = { reason: "unmapped-fuel-type", nodeId: id };
      if (fuelType) skip.fuelType = fuelType;
      skipped.push(skip);
      continue;
    }
    const ppl = parsePriceToPpl(entry.price);
    if (ppl === undefined) {
      const skip: FuelFinderSkip = {
        reason: entry.price === null || entry.price === undefined || entry.price === "" ? "price-null" : "price-out-of-range",
        nodeId: id,
      };
      if (fuelType) skip.fuelType = fuelType;
      skipped.push(skip);
      continue;
    }
    const observedAt = asIso(entry.price_last_updated, nowIso);
    if (!lastSeenAt || Date.parse(observedAt) > Date.parse(lastSeenAt)) lastSeenAt = observedAt;
    prices.push({
      stationId: id,
      grade,
      priceTenthsPence: pplToTenths(ppl),
      observedAt,
      rawPayloadJson: entry,
    });
  }
  return lastSeenAt ? { prices, skipped, lastSeenAt } : { prices, skipped };
}

function dedupeStations(stations: NormalisedStation[]): {
  stations: NormalisedStation[];
  aliases: Map<string, string>;
  skipped: FuelFinderSkip[];
} {
  const aliases = new Map<string, string>();
  const skipped: FuelFinderSkip[] = [];
  const kept: NormalisedStation[] = [];
  const byId = new Map<string, NormalisedStation>();

  for (const station of stations) {
    const existing = byId.get(station.id);
    if (!existing) {
      byId.set(station.id, station);
      continue;
    }
    byId.set(station.id, preferStation(existing, station));
  }

  const unique = [...byId.values()];
  const used = new Set<string>();
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    if (!a || used.has(a.id)) continue;
    let winner = a;
    for (let j = i + 1; j < unique.length; j++) {
      const b = unique[j];
      if (!b || used.has(b.id)) continue;
      if (a.brandCanonical !== b.brandCanonical) continue;
      if (distanceMeters(a, b) > DEDUPE_METERS) continue;
      const next = preferStation(winner, b);
      const loser = next.id === winner.id ? b : winner;
      winner = next;
      used.add(loser.id);
      aliases.set(loser.id, winner.id);
      skipped.push({ reason: "duplicate-site", nodeId: loser.id });
    }
    used.add(winner.id);
    kept.push(winner);
  }

  for (const [loser, winner] of aliases) {
    let cursor = winner;
    const seen = new Set([loser]);
    while (aliases.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = aliases.get(cursor) ?? cursor;
    }
    aliases.set(loser, cursor);
  }

  return { stations: kept, aliases, skipped };
}

function preferStation(a: NormalisedStation, b: NormalisedStation): NormalisedStation {
  const aSeen = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
  const bSeen = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
  if (bSeen !== aSeen) return bSeen > aSeen ? b : a;
  return a.id <= b.id ? a : b;
}

export function normaliseFuelFinder(input: {
  pfs: FuelFinderPfs[];
  prices: FuelFinderPriceRow[];
  nowIso: string;
}): FuelFinderNormaliseResult {
  const skipped: FuelFinderSkip[] = [];
  const stationRows: NormalisedStation[] = [];
  for (const row of input.pfs) {
    const got = normalisePfs(row, input.nowIso);
    if ("reason" in got && !("id" in got)) {
      skipped.push(got);
      continue;
    }
    stationRows.push(got as NormalisedStation);
  }

  const priceRows: NormalisedPrice[] = [];
  const lastSeenByStation = new Map<string, string>();
  for (const row of input.prices) {
    const got = normalisePrices(row, input.nowIso);
    skipped.push(...got.skipped);
    priceRows.push(...got.prices);
    if (got.lastSeenAt && row.node_id) {
      const prev = lastSeenByStation.get(row.node_id);
      if (!prev || Date.parse(got.lastSeenAt) > Date.parse(prev)) {
        lastSeenByStation.set(row.node_id, got.lastSeenAt);
      }
    }
  }

  for (const station of stationRows) {
    const seen = lastSeenByStation.get(station.id) ?? station.lastSeenAt;
    if (seen) station.lastSeenAt = seen;
    if (!station.isStale) station.isStale = isStaleAt(station.lastSeenAt, input.nowIso);
  }

  const { stations, aliases, skipped: dupes } = dedupeStations(stationRows);
  skipped.push(...dupes);
  const prices: NormalisedPrice[] = [];
  for (const price of priceRows) {
    const stationId = aliases.get(price.stationId) ?? price.stationId;
    prices.push({ ...price, stationId });
  }

  return { stations, prices, skipped };
}

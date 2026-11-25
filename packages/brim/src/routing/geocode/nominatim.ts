import { unboundFetch, type FetchFn } from "../../shared/unbound-fetch.js";
import { RoutingError } from "../types.js";
import type { AutocompleteOpts, GeocodeHit, Geocoder, PlaceSuggestion } from "./types.js";

const DEFAULT_NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "LocationsJourneyCost/1.0 (+https://locations.aden.website)";
const TIMEOUT_MS = 8_000;
const MIN_PUBLIC_SPACING_MS = 1_000;

let nextNominatimSlotMs = 0;

function normaliseNominatimBase(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_NOMINATIM_BASE;
  return trimmed.replace(/\/+$/, "").replace(/\/(search|reverse|lookup)$/i, "");
}

function isPublicNominatim(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "nominatim.openstreetmap.org";
  } catch {
    return false;
  }
}

/**
 * Reserve a 1 req/s slot synchronously before awaiting so concurrent callers
 * still space requests cleanly against public Nominatim.
 */
async function awaitNominatimSlot(enabled: boolean): Promise<void> {
  if (!enabled) return;
  const now = Date.now();
  const scheduled = Math.max(now, nextNominatimSlotMs);
  nextNominatimSlotMs = scheduled + MIN_PUBLIC_SPACING_MS;
  const waitMs = scheduled - now;
  if (waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}

type NominatimRow = {
  display_name?: string;
  lat?: string | number;
  lon?: string | number;
  osm_type?: string;
  osm_id?: string | number;
  place_id?: string | number;
  error?: string;
};

function osmPrefix(osmType: string | undefined): string | undefined {
  if (!osmType) return undefined;
  const t = osmType.toLowerCase();
  if (t === "node" || t === "n") return "N";
  if (t === "way" || t === "w") return "W";
  if (t === "relation" || t === "r") return "R";
  return undefined;
}

function osmToken(row: NominatimRow): string | undefined {
  const prefix = osmPrefix(row.osm_type);
  const id = row.osm_id !== undefined && row.osm_id !== null ? String(row.osm_id).trim() : "";
  if (prefix && /^\d+$/.test(id)) return `nominatim:${prefix}${id}`;
  if (row.display_name?.trim()) return `nominatim:${row.display_name.trim()}`;
  return undefined;
}

function parseHit(row: NominatimRow): GeocodeHit | undefined {
  if (row.error || !row.display_name) return undefined;
  const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
  const lng = typeof row.lon === "number" ? row.lon : Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const hit: GeocodeHit = {
    label: row.display_name,
    lat,
    lng,
  };
  const placeId = osmToken(row);
  if (placeId) hit.placeId = placeId;
  return hit;
}

export class NominatimGeocoder implements Geocoder {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchFn;
  private readonly pacePublic: boolean;

  constructor(
    baseUrlOrOpts?: string | { baseUrl?: string | undefined; fetchImpl?: FetchFn | undefined },
    fetchImpl: FetchFn = fetch,
  ) {
    const rawBase = typeof baseUrlOrOpts === "string" ? baseUrlOrOpts : baseUrlOrOpts?.baseUrl;
    const chosenFetch =
      (typeof baseUrlOrOpts === "object" && baseUrlOrOpts?.fetchImpl ? baseUrlOrOpts.fetchImpl : undefined) ??
      fetchImpl;
    this.baseUrl = normaliseNominatimBase(rawBase);
    this.fetchImpl = unboundFetch(chosenFetch);
    this.pacePublic = chosenFetch === fetch && isPublicNominatim(this.baseUrl);
  }

  private headers(): Record<string, string> {
    return {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "en-GB,en",
    };
  }

  async autocomplete(query: string, opts?: AutocompleteOpts): Promise<PlaceSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("q", trimmed);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "gb");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");
    if (opts?.bias) {
      const { lat, lng } = opts.bias;
      url.searchParams.set("viewbox", `${(lng - 0.5).toFixed(4)},${(lat + 0.5).toFixed(4)},${(lng + 0.5).toFixed(4)},${(lat - 0.5).toFixed(4)}`);
      url.searchParams.set("bounded", "0");
    }
    await awaitNominatimSlot(this.pacePublic);
    const res = await this.fetchImpl(url.toString(), {
      headers: this.headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) throw new RoutingError("quota", "Nominatim quota exceeded");
    if (!res.ok) throw new RoutingError("upstream", `Nominatim ${res.status}`);
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    const out: PlaceSuggestion[] = [];
    for (const raw of rows as NominatimRow[]) {
      const hit = parseHit(raw);
      if (!hit) continue;
      const suggestion: PlaceSuggestion = {
        label: hit.label,
        lat: hit.lat,
        lng: hit.lng,
      };
      if (hit.placeId) suggestion.placeId = hit.placeId;
      out.push(suggestion);
    }
    return out;
  }

  async resolve(placeId: string): Promise<GeocodeHit | undefined> {
    const trimmed = placeId.trim();
    if (!trimmed) return undefined;
    const osmMatch = /^nominatim:([NWR]\d+)$/i.exec(trimmed);
    if (osmMatch?.[1]) {
      const url = new URL(`${this.baseUrl}/lookup`);
      url.searchParams.set("osm_ids", osmMatch[1].toUpperCase());
      url.searchParams.set("format", "jsonv2");
      await awaitNominatimSlot(this.pacePublic);
      const res = await this.fetchImpl(url.toString(), {
        headers: this.headers(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return undefined;
      if (res.status === 429) throw new RoutingError("quota", "Nominatim quota exceeded");
      if (!res.ok) throw new RoutingError("upstream", `Nominatim lookup ${res.status}`);
      const rows = (await res.json()) as unknown;
      if (!Array.isArray(rows) || rows.length === 0) return undefined;
      return parseHit(rows[0] as NominatimRow);
    }
    const query = trimmed.startsWith("nominatim:") ? trimmed.slice("nominatim:".length) : trimmed;
    const suggestions = await this.autocomplete(query);
    const first = suggestions[0];
    if (!first || first.lat === undefined || first.lng === undefined) return undefined;
    const hit: GeocodeHit = { label: first.label, lat: first.lat, lng: first.lng };
    if (first.placeId) hit.placeId = first.placeId;
    return hit;
  }

  async reverse(lat: number, lng: number): Promise<GeocodeHit | undefined> {
    const url = new URL(`${this.baseUrl}/reverse`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");
    await awaitNominatimSlot(this.pacePublic);
    const res = await this.fetchImpl(url.toString(), {
      headers: this.headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return undefined;
    if (res.status === 429) throw new RoutingError("quota", "Nominatim quota exceeded");
    if (!res.ok) throw new RoutingError("upstream", `Nominatim reverse ${res.status}`);
    const row = (await res.json()) as NominatimRow;
    return parseHit(row);
  }

  async snap(lat: number, lng: number): Promise<{ lat: number; lng: number }> {
    return { lat, lng };
  }
}

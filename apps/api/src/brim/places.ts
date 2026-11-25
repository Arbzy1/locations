import { z } from "zod";
import { isFixtureMode } from "@locations/brim/shared";
import {
  budgetStatus,
  CachedGeocoder,
  chooseGeocoder,
  GEOCODE_COST_USD,
  GoogleGeocoder,
  MemoryCache,
  type AutocompleteOpts,
  type GeocodeHit,
  type Geocoder,
  type PlaceSuggestion,
} from "@locations/brim/routing";
import { NeonRouteCache } from "./db/route-cache";
import { addRoutingSpendUsd, getRoutingSpendUsd } from "./db/repo";
import type { BrimDb } from "./db/types";
import { createLogger } from "./logger";
import { persistLive, requestBrimDb, type BrimContext } from "./context";

const log = createLogger();
const isolateCache = new MemoryCache();

class MeteredGeocoder implements Geocoder {
  constructor(
    private readonly inner: Geocoder,
    private readonly db: BrimDb,
  ) {}

  private recordSpend() {
    return addRoutingSpendUsd(this.db, GEOCODE_COST_USD).catch(() => {
      log.info({ kind: "geocode_spend", ok: false });
    });
  }

  async autocomplete(query: string, opts?: AutocompleteOpts): Promise<PlaceSuggestion[]> {
    const out = await this.inner.autocomplete(query, opts);
    await this.recordSpend();
    return out;
  }

  async resolve(placeId: string, opts?: { session?: string }): Promise<GeocodeHit | undefined> {
    const out = await this.inner.resolve(placeId, opts);
    await this.recordSpend();
    return out;
  }

  async reverse(lat: number, lng: number): Promise<GeocodeHit | undefined> {
    const out = await this.inner.reverse(lat, lng);
    await this.recordSpend();
    return out;
  }

  async snap(lat: number, lng: number): Promise<{ lat: number; lng: number }> {
    const out = await this.inner.snap(lat, lng);
    await this.recordSpend();
    return out;
  }
}

async function geocoderFor(c: BrimContext): Promise<Geocoder> {
  const fixtureMode = isFixtureMode(c.env.BRIM_FIXTURES);
  if (fixtureMode) {
    return chooseGeocoder({
      fixtureMode: true,
      cache: isolateCache,
    });
  }

  const hasDb = Boolean(c.env.DATABASE_URL);
  const db = hasDb ? requestBrimDb(c) : undefined;
  const cache = db && persistLive(db) ? new NeonRouteCache(db) : isolateCache;

  if (c.env.GOOGLE_MAPS_API_KEY) {
    const ceilingUsd = Number(c.env.ROUTING_CEILING_USD ?? 50);
    const recordedUsd = db ? await getRoutingSpendUsd(db).catch(() => ceilingUsd) : 0;
    const spentUsd = Math.max(Number(c.env.ROUTING_SPENT_USD ?? 0), recordedUsd);
    if (!budgetStatus({ spentUsd, ceilingUsd }).exceeded) {
      const google = new GoogleGeocoder(c.env.GOOGLE_MAPS_API_KEY);
      const inner = db ? new MeteredGeocoder(google, db) : google;
      return new CachedGeocoder(inner, cache);
    }
    log.info({ branch: "nominatim-failover", kind: "places_spend_ceiling" });
  }

  return chooseGeocoder({
    fixtureMode: false,
    geocodeBase: c.env.GEOCODE_BASE,
    cache,
  });
}

export async function handlePlaces(c: BrimContext) {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ places: [] });
  const session = c.req.query("session");
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  const geo = await geocoderFor(c);
  const opts: { session?: string; bias?: { lat: number; lng: number } } = {};
  if (session) opts.session = session;
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    opts.bias = { lat, lng };
  }
  try {
    const places = await geo.autocomplete(q, Object.keys(opts).length > 0 ? opts : undefined);
    return c.json({ places: Array.isArray(places) ? places : [] });
  } catch {
    log.info({ error: "places_autocomplete_failed" });
    return c.json({ error: "upstream" }, 502);
  }
}

export async function handlePlaceResolve(c: BrimContext) {
  const body = z
    .object({ placeId: z.string().min(1), session: z.string().optional() })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  const geo = await geocoderFor(c);
  const opts = body.data.session ? { session: body.data.session } : undefined;
  try {
    const place = await geo.resolve(body.data.placeId, opts);
    if (!place) return c.json({ error: "not_found" }, 404);
    return c.json({ place });
  } catch {
    log.info({ error: "places_resolve_failed" });
    return c.json({ error: "upstream" }, 502);
  }
}

export async function handlePlaceReverse(c: BrimContext) {
  const body = z
    .object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  const geo = await geocoderFor(c);
  let snapped: { lat: number; lng: number };
  try {
    snapped = await geo.snap(body.data.lat, body.data.lng);
  } catch {
    log.info({ error: "places_snap_failed" });
    snapped = { lat: body.data.lat, lng: body.data.lng };
  }
  let named: GeocodeHit | undefined;
  try {
    named = await geo.reverse(snapped.lat, snapped.lng);
  } catch {
    log.info({ error: "places_reverse_failed" });
    named = undefined;
  }
  const moved =
    Math.abs(snapped.lat - body.data.lat) > 1e-6 || Math.abs(snapped.lng - body.data.lng) > 1e-6;
  const lat = moved ? snapped.lat : (named?.lat ?? snapped.lat);
  const lng = moved ? snapped.lng : (named?.lng ?? snapped.lng);
  if (!named) {
    return c.json({
      place: {
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        lat,
        lng,
      },
    });
  }
  const place: { label: string; lat: number; lng: number; placeId?: string } = {
    label: named.label,
    lat,
    lng,
  };
  if (named.placeId) place.placeId = named.placeId;
  return c.json({ place });
}

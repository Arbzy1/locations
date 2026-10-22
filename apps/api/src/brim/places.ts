import { z } from 'zod';
import { isFixtureMode } from '@locations/brim/shared';
import { chooseGeocoder, KvCache, MemoryCache, type GeocodeHit } from '@locations/brim/routing';
import type { Context } from 'hono';
import { NeonRouteCache } from './db/route-cache';
import { createLogger } from './logger';
import { createDb, persistLive, type BrimContext } from "./context";
import type { Env } from "../env";

const log = createLogger();

const isolateCache = new MemoryCache();

function cacheFor(env: Env) {
  if (env.DATABASE_URL) {
    const db = createDb(env);
    if (persistLive(db)) return new NeonRouteCache(db);
  }
  return isolateCache;
}

function geocoderFor(c: BrimContext) {
  return chooseGeocoder({
    fixtureMode: isFixtureMode(c.env.BRIM_FIXTURES),
    googleKey: c.env.GOOGLE_MAPS_API_KEY,
    cache: cacheFor(c.env),
  });
}

export async function handlePlaces(c: BrimContext) {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ places: [] });
  const session = c.req.query('session');
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  const geo = geocoderFor(c);
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
    log.info({ error: 'places_autocomplete_failed' });
    return c.json({ error: 'upstream' }, 502);
  }
}

export async function handlePlaceResolve(c: BrimContext) {
  const body = z.object({ placeId: z.string().min(1), session: z.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const geo = geocoderFor(c);
  const opts = body.data.session ? { session: body.data.session } : undefined;
  try {
    const place = await geo.resolve(body.data.placeId, opts);
    if (!place) return c.json({ error: 'not_found' }, 404);
    return c.json({ place });
  } catch {
    log.info({ error: 'places_resolve_failed' });
    return c.json({ error: 'upstream' }, 502);
  }
}

export async function handlePlaceReverse(c: BrimContext) {
  const body = z
    .object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'invalid_request' }, 400);
  const geo = geocoderFor(c);
  let snapped: { lat: number; lng: number };
  try {
    snapped = await geo.snap(body.data.lat, body.data.lng);
  } catch {
    log.info({ error: 'places_snap_failed' });
    snapped = { lat: body.data.lat, lng: body.data.lng };
  }
  let named: GeocodeHit | undefined;
  try {
    named = await geo.reverse(snapped.lat, snapped.lng);
  } catch {
    log.info({ error: 'places_reverse_failed' });
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

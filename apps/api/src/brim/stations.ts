import { isFixtureMode } from '@locations/brim/shared';
import type { Context } from 'hono';
import {
  decorateNearby,
  fixtureCorpus,
  liveNationalMedians,
  liveNearby,
  nationalMediansFromObservations,
  nearbyFromObservations,
  radiusMetersFromQuery,
} from './prices';
import { handleStationsNearRoute } from './fill';
import { createDb, persistLive, type BrimContext } from "./context";

function parseFuelGrade(raw: string | undefined) {
  if (raw === 'E10' || raw === 'E5' || raw === 'B7' || raw === 'SDV' || raw === 'LPG') return raw;
  return undefined;
}

export async function handleStationsNear(c: BrimContext) {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'invalid_request', reason: 'lat and lng are required' }, 400);
  }
  const grade = parseFuelGrade(c.req.query('grade'));
  const radiusMeters = radiusMetersFromQuery(c.req.query('radiusKm'));
  if (isFixtureMode(c.env.BRIM_FIXTURES)) {
    const corpus = fixtureCorpus(c.env.BRIM_FIXTURES);
    const hits = nearbyFromObservations(corpus.observations, {
      lat,
      lng,
      radiusMeters,
      ...(grade ? { grade } : {}),
    });
    return c.json({ stations: decorateNearby(hits, corpus.stations) });
  }
  const db = createDb(c.env);
  if (!persistLive(db)) return c.json({ stations: [] });
  const stations = await liveNearby(db, {
    lat,
    lng,
    radiusMeters,
    ...(grade ? { grade } : {}),
  });
  return c.json({ stations: Array.isArray(stations) ? stations : [] });
}

export async function handleMetaPrices(c: BrimContext) {
  if (isFixtureMode(c.env.BRIM_FIXTURES)) {
    const corpus = fixtureCorpus(c.env.BRIM_FIXTURES);
    return c.json({ grades: nationalMediansFromObservations(corpus.observations) });
  }
  const db = createDb(c.env);
  if (!persistLive(db)) return c.json({ grades: {} });
  return c.json({ grades: await liveNationalMedians(db) });
}

export { handleStationsNearRoute };

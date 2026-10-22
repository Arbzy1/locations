import { z } from 'zod';
import {
  dvlaVesBody,
  dvlaVesHeaders,
  dvlaVesUrl,
  isFixtureMode,
  joinOutcome,
  joinVca,
  loadFixture,
  normaliseVrm,
  parseVesJson,
  type VcaVehicle,
  type VesVehicle,
} from '@locations/brim/shared';
import { and, eq, ilike } from 'drizzle-orm';
import type { Context } from 'hono';
import { rowToVca } from './catalogue';
import { brimVcaVehicles as vcaVehicles } from '@locations/db';
import type { BrimDb } from './db/types';
import { createDb, persistLive, type BrimContext } from "./context";
import type { Env } from "../env";

const bodySchema = z.object({ vrm: z.string().min(1) });

function vesPublic(ves: VesVehicle) {
  const out: Record<string, unknown> = { make: ves.make, propulsion: ves.propulsion };
  if (ves.year !== undefined) out.year = ves.year;
  if (ves.engineCc !== undefined) out.engineCc = ves.engineCc;
  if (ves.co2Gkm !== undefined) out.co2Gkm = ves.co2Gkm;
  if (ves.euroStatus) out.euroStatus = ves.euroStatus;
  return out;
}

async function liveVes(apiKey: string, vrm: string): Promise<VesVehicle | { status: 404 | 502 }> {
  const res = await fetch(dvlaVesUrl(), {
    method: 'POST',
    headers: dvlaVesHeaders(apiKey),
    body: JSON.stringify(dvlaVesBody(vrm)),
  });
  if (res.status === 404) return { status: 404 };
  if (!res.ok) return { status: 502 };
  const json: unknown = await res.json();
  const parsed = parseVesJson(json);
  if ('reason' in parsed) return { status: 404 };
  return parsed;
}

async function vcaCorpus(env: Env, db: BrimDb, ves: VesVehicle): Promise<VcaVehicle[]> {
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    return loadFixture<VcaVehicle[]>('vca-vehicles', env.BRIM_FIXTURES);
  }
  if (!persistLive(db) || !db.db) return [];
  const rows = await db.db
    .select()
    .from(vcaVehicles)
    .where(and(ilike(vcaVehicles.make, ves.make), eq(vcaVehicles.fuel, ves.propulsion)))
    .limit(40);
  return rows.flatMap((row) => {
    const mapped = rowToVca(row);
    return mapped ? [mapped] : [];
  });
}

export async function handleVehiclesResolve(c: BrimContext) {
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const vrm = normaliseVrm(parsed.data.vrm);
  if (!vrm) return c.json({ error: 'invalid_vrm', reason: 'Use a current UK registration (two letters, two digits, three letters).' }, 400);

  let ves: VesVehicle;
  if (isFixtureMode(c.env.BRIM_FIXTURES)) {
    const fixtures = loadFixture<{ ves: Record<string, unknown> }>('dvla', c.env.BRIM_FIXTURES);
    const raw = fixtures.ves[vrm];
    if (!raw) return c.json({ error: 'not_found' }, 404);
    const parsedVes = parseVesJson(raw);
    if ('reason' in parsedVes) return c.json({ error: 'not_found' }, 404);
    ves = parsedVes;
  } else {
    const apiKey = c.env.DVLA_VES_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'dvla_unavailable', reason: 'DVLA_VES_API_KEY is not configured.' }, 503);
    }
    const got = await liveVes(apiKey, vrm);
    if ('status' in got) return c.json({ error: got.status === 404 ? 'not_found' : 'dvla_unavailable' }, got.status);
    ves = got;
  }

  const db = createDb(c.env);
  const candidates = joinVca(ves, await vcaCorpus(c.env, db, ves));
  return c.json({
    outcome: joinOutcome(candidates.length),
    ves: vesPublic(ves),
    candidates,
  });
}

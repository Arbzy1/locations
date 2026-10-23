/**
 * Browser-driven imports and aggregate rebuilds for the Workers free plan (10 ms CPU per
 * request). The browser parses the export and computes aggregates; these helpers only
 * validate and store small batches, so every request stays a few milliseconds of CPU.
 */
import {
  AGGREGATES_STALE_KEY,
  MAX_PATH_POINTS,
  TRANSPORT_MODE_MAP,
  activities,
  analyticsCache,
  and,
  dataSources,
  ensureDataSource,
  asc,
  dayStats,
  eq,
  gt,
  importJobs,
  markAggregatesStale,
  namedTrips,
  namedTripsFromMemories,
  sql,
  visits,
  type PathPoint,
  type TenantId,
  type TimelineMemory,
} from "@locations/db";
import type { createDb } from "@locations/db";

type Db = ReturnType<typeof createDb>;

/** Rows per append request; keeps body parsing and SQL building well under 10 ms. */
export const IMPORT_BATCH_ROWS = 250;
/** Rows per aggregate-input page. */
export const AGGREGATE_INPUT_PAGE = 500;
/**
 * Largest request body for row and aggregate writes. The browser aims for ~120 KB;
 * long GPS paths make bytes, not row count, the real CPU cost.
 */
export const MAX_BATCH_BODY_BYTES = 256 * 1024;

/** Parse a JSON body capped at MAX_BATCH_BODY_BYTES; null when too big or invalid. */
export async function readBatchBody(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const text = await req.text();
  if (text.length > MAX_BATCH_BODY_BYTES) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}
/** day_stats rows per aggregate write. */
export const AGGREGATE_DAY_BATCH = 500;
/** Largest single analytics entry accepted (serialised bytes). */
const ANALYTICS_ENTRY_MAX_BYTES = 768 * 1024;
const ANALYTICS_KEY = /^[a-z0-9-]{1,40}(:\d{4})?$/;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MODES = new Set(Object.values(TRANSPORT_MODE_MAP));

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, min: number, max: number) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const str = (x: unknown, max: number) => typeof x === "string" && x.length <= max;
const optStr = (x: unknown, max: number) => x === null || x === undefined || str(x, max);
const optNum = (x: unknown, min: number, max: number) => x === null || x === undefined || num(x, min, max);
const isoTime = (x: unknown) => str(x, 40) && (x as string).length >= 10 && Number.isFinite(Date.parse(x as string));
const day = (x: unknown) => typeof x === "string" && ISO_DAY.test(x);

export type VisitInput = {
  start: string;
  end: string;
  date: string;
  lat: number;
  lon: number;
  cluster: string;
  semanticType: string;
  placeId: string | null;
  durationMinutes: number;
  fixLat: number | null;
  fixLon: number | null;
  fixCount: number | null;
  placeKey: string | null;
  googleName: string | null;
};

export type ActivityInput = {
  start: string;
  end: string;
  date: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  mode: string;
  distanceMeters: number;
  durationMinutes: number;
  path: PathPoint[] | null;
};

/** Validate one stay from the browser; only known fields are copied. */
export function checkVisit(x: unknown): Check<VisitInput> {
  if (!isObj(x)) return { ok: false, error: "visit must be an object" };
  if (!isoTime(x.start) || !isoTime(x.end)) return { ok: false, error: "visit start/end must be timestamps" };
  if (!day(x.date)) return { ok: false, error: "visit date must be YYYY-MM-DD" };
  if (!num(x.lat, -90, 90) || !num(x.lon, -180, 180)) return { ok: false, error: "visit position out of range" };
  if (!str(x.cluster, 80) || !str(x.semanticType, 80)) return { ok: false, error: "visit labels too long" };
  if (!num(x.durationMinutes, 0, 60 * 24 * 400)) return { ok: false, error: "visit duration out of range" };
  if (!optStr(x.placeId, 300) || !optStr(x.placeKey, 320) || !optStr(x.googleName, 200)) {
    return { ok: false, error: "visit place fields too long" };
  }
  if (!optNum(x.fixLat, -90, 90) || !optNum(x.fixLon, -180, 180) || !(x.fixCount === null || x.fixCount === undefined || (Number.isInteger(x.fixCount) && num(x.fixCount, 0, 100_000)))) {
    return { ok: false, error: "visit GPS fix out of range" };
  }
  return {
    ok: true,
    value: {
      start: x.start as string,
      end: x.end as string,
      date: x.date as string,
      lat: x.lat as number,
      lon: x.lon as number,
      cluster: x.cluster as string,
      semanticType: x.semanticType as string,
      placeId: (x.placeId as string | null | undefined) ?? null,
      durationMinutes: x.durationMinutes as number,
      fixLat: (x.fixLat as number | null | undefined) ?? null,
      fixLon: (x.fixLon as number | null | undefined) ?? null,
      fixCount: (x.fixCount as number | null | undefined) ?? null,
      placeKey: (x.placeKey as string | null | undefined) ?? null,
      googleName: (x.googleName as string | null | undefined) ?? null,
    },
  };
}

/** Validate one journey from the browser, including its GPS path. */
export function checkActivity(x: unknown): Check<ActivityInput> {
  if (!isObj(x)) return { ok: false, error: "journey must be an object" };
  if (!isoTime(x.start) || !isoTime(x.end)) return { ok: false, error: "journey start/end must be timestamps" };
  if (!day(x.date)) return { ok: false, error: "journey date must be YYYY-MM-DD" };
  if (
    !num(x.startLat, -90, 90) ||
    !num(x.endLat, -90, 90) ||
    !num(x.startLon, -180, 180) ||
    !num(x.endLon, -180, 180)
  ) {
    return { ok: false, error: "journey position out of range" };
  }
  if (typeof x.mode !== "string" || !MODES.has(x.mode)) return { ok: false, error: "unknown journey mode" };
  if (!num(x.distanceMeters, 0, 40_075_000) || !num(x.durationMinutes, 0, 60 * 24 * 400)) {
    return { ok: false, error: "journey distance or duration out of range" };
  }
  let path: PathPoint[] | null = null;
  if (x.path !== null && x.path !== undefined) {
    if (!Array.isArray(x.path) || x.path.length > MAX_PATH_POINTS) return { ok: false, error: "journey path too long" };
    path = [];
    for (const p of x.path) {
      if (!Array.isArray(p) || p.length !== 3 || !num(p[0], -90, 90) || !num(p[1], -180, 180) || !num(p[2], 0, 4e10)) {
        return { ok: false, error: "journey path point invalid" };
      }
      path.push([p[0], p[1], p[2]]);
    }
  }
  return {
    ok: true,
    value: {
      start: x.start as string,
      end: x.end as string,
      date: x.date as string,
      startLat: x.startLat as number,
      startLon: x.startLon as number,
      endLat: x.endLat as number,
      endLon: x.endLon as number,
      mode: x.mode,
      distanceMeters: x.distanceMeters as number,
      durationMinutes: x.durationMinutes as number,
      path: path?.length ? path : null,
    },
  };
}

/** Validate an append body: at most IMPORT_BATCH_ROWS rows in total. */
export function checkRowBatch(body: unknown): Check<{ visits: VisitInput[]; activities: ActivityInput[] }> {
  if (!isObj(body)) return { ok: false, error: "JSON body required" };
  const v = body.visits ?? [];
  const a = body.activities ?? [];
  if (!Array.isArray(v) || !Array.isArray(a)) return { ok: false, error: "visits and activities must be arrays" };
  if (v.length + a.length === 0) return { ok: false, error: "No rows in batch" };
  if (v.length + a.length > IMPORT_BATCH_ROWS) return { ok: false, error: `At most ${IMPORT_BATCH_ROWS} rows per batch` };
  const out = { visits: [] as VisitInput[], activities: [] as ActivityInput[] };
  for (const [i, row] of v.entries()) {
    const c = checkVisit(row);
    if (!c.ok) return { ok: false, error: `visits[${i}]: ${c.error}` };
    out.visits.push(c.value);
  }
  for (const [i, row] of a.entries()) {
    const c = checkActivity(row);
    if (!c.ok) return { ok: false, error: `activities[${i}]: ${c.error}` };
    out.activities.push(c.value);
  }
  return { ok: true, value: out };
}

/** Google's trips from the browser (timelineMemory), at most 2,000 per import. */
export function checkMemories(x: unknown): Check<TimelineMemory[]> {
  if (x === undefined || x === null) return { ok: true, value: [] };
  if (!Array.isArray(x) || x.length > 2000) return { ok: false, error: "memories must be a list of up to 2000 trips" };
  const out: TimelineMemory[] = [];
  for (const m of x) {
    if (!isObj(m) || !isoTime(m.start) || !isoTime(m.end) || !optNum(m.distanceKm, 0, 40_075)) {
      return { ok: false, error: "memory invalid" };
    }
    out.push({ start: m.start as string, end: m.end as string, destinations: [], distanceKm: (m.distanceKm as number | null) ?? null });
  }
  return { ok: true, value: out };
}

/** Days and stay count already stored (optionally for one source); null if the source is not this tenant's. */
export async function existingImportDays(db: Db, tenant: TenantId, sourceId?: string) {
  if (sourceId) {
    const [src] = await db
      .select({ id: dataSources.id })
      .from(dataSources)
      .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)))
      .limit(1);
    if (!src) return null;
  }
  const vFilter = sourceId ? and(eq(visits.tenant, tenant), eq(visits.sourceId, sourceId)) : eq(visits.tenant, tenant);
  const aFilter = sourceId
    ? and(eq(activities.tenant, tenant), eq(activities.sourceId, sourceId))
    : eq(activities.tenant, tenant);
  const [v] = await db.select({ n: sql<number>`count(*)::int` }).from(visits).where(vFilter);
  const dates = await db
    .selectDistinct({ date: visits.date })
    .from(visits)
    .where(vFilter)
    .union(db.selectDistinct({ date: activities.date }).from(activities).where(aFilter));
  return { visitCount: v?.n ?? 0, dates: dates.map((d) => d.date).sort() };
}

/**
 * Open a browser import: resolve or create the source, clear it unless merging, and
 * create a processing job. Returns an HTTP-ish status for the route.
 */
export async function startImportJob(
  db: Db,
  tenant: TenantId,
  opts: {
    userId: string;
    sourceId?: string;
    label: string;
    merge: boolean;
    chosenFile: string | null;
    parsedCount: number;
    maxSources: number;
  },
): Promise<{ status: 200; jobId: string; sourceId: string; label: string } | { status: 403 | 404 | 409 }> {
  const [active] = await db
    .select({ id: importJobs.id })
    .from(importJobs)
    .where(and(eq(importJobs.tenant, tenant), sql`${importJobs.status} in ('pending', 'processing')`))
    .limit(1);
  if (active) return { status: 409 };
  let sourceId: string;
  let label: string;
  if (opts.sourceId) {
    const [existing] = await db
      .select({ id: dataSources.id, label: dataSources.label })
      .from(dataSources)
      .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, opts.sourceId)))
      .limit(1);
    if (!existing) return { status: 404 };
    sourceId = existing.id;
    label = existing.label;
  } else {
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dataSources)
      .where(eq(dataSources.tenant, tenant));
    const n = count?.n ?? 0;
    if (n >= opts.maxSources) return { status: 403 };
    label = opts.label || `Google account ${n + 1}`;
    sourceId = (await ensureDataSource(db, { tenant, label })).id;
  }
  // Replace: clear this source now; rows then arrive in batches.
  if (!opts.merge) {
    await db.delete(visits).where(and(eq(visits.tenant, tenant), eq(visits.sourceId, sourceId)));
    await db.delete(activities).where(and(eq(activities.tenant, tenant), eq(activities.sourceId, sourceId)));
  }
  const jobId = crypto.randomUUID();
  const now = new Date();
  await db.insert(importJobs).values({
    id: jobId,
    tenant,
    sourceId,
    userId: opts.userId,
    status: "processing",
    merge: opts.merge,
    chosenFile: opts.chosenFile,
    r2Key: null,
    parsedCount: opts.parsedCount,
    visitCount: 0,
    activityCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return { status: 200, jobId, sourceId, label };
}

/** A job this tenant owns that is still accepting rows, else null (route answers 404). */
export async function openImportJob(db: Db, tenant: TenantId, jobId: string) {
  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.tenant, tenant), eq(importJobs.id, jobId.slice(0, 64))))
    .limit(1);
  return job && job.status === "processing" ? job : null;
}

/** Store one validated batch under the job's source and bump the job's counters. */
export async function appendImportRows(
  db: Db,
  tenant: TenantId,
  job: { id: string; sourceId: string },
  rows: { visits: VisitInput[]; activities: ActivityInput[] },
) {
  // One JSON parameter expanded by Postgres: building a 250-row Drizzle insert costs
  // ~10 ms of Worker CPU, the whole free-plan budget. Values are bound, never spliced.
  if (rows.visits.length) {
    await db.execute(sql`
      insert into visits (tenant, source_id, start, "end", date, lat, lon, cluster, semantic_type, place_id,
        duration_minutes, fix_lat, fix_lon, fix_count, place_key, google_name)
      select ${tenant}, ${job.sourceId}, x.start, x."end", x.date, x.lat, x.lon, x.cluster, x."semanticType",
        x."placeId", x."durationMinutes", x."fixLat", x."fixLon", x."fixCount", x."placeKey", x."googleName"
      from jsonb_to_recordset(${JSON.stringify(rows.visits)}::jsonb) as x(
        start text, "end" text, date text, lat real, lon real, cluster text, "semanticType" text, "placeId" text,
        "durationMinutes" real, "fixLat" real, "fixLon" real, "fixCount" integer, "placeKey" text, "googleName" text)`);
  }
  if (rows.activities.length) {
    await db.execute(sql`
      insert into activities (tenant, source_id, start, "end", date, start_lat, start_lon, end_lat, end_lon, mode,
        distance_meters, duration_minutes, path)
      select ${tenant}, ${job.sourceId}, x.start, x."end", x.date, x."startLat", x."startLon", x."endLat", x."endLon",
        x.mode, x."distanceMeters", x."durationMinutes", x.path
      from jsonb_to_recordset(${JSON.stringify(rows.activities)}::jsonb) as x(
        start text, "end" text, date text, "startLat" real, "startLon" real, "endLat" real, "endLon" real, mode text,
        "distanceMeters" real, "durationMinutes" real, path jsonb)`);
  }
  await db
    .update(importJobs)
    .set({
      visitCount: sql`coalesce(${importJobs.visitCount}, 0) + ${rows.visits.length}`,
      activityCount: sql`coalesce(${importJobs.activityCount}, 0) + ${rows.activities.length}`,
      updatedAt: new Date(),
    })
    .where(and(eq(importJobs.tenant, tenant), eq(importJobs.id, job.id)));
}

/** Finish: Google's trips become named trips, aggregates are flagged, the job is ready. */
export async function finishImportJob(
  db: Db,
  tenant: TenantId,
  job: { id: string; sourceId: string },
  memories: TimelineMemory[],
) {
  const trips = namedTripsFromMemories(memories, job.sourceId);
  for (let i = 0; i < trips.length; i += 200) {
    await db
      .insert(namedTrips)
      .values(trips.slice(i, i + 200).map((t) => ({ ...t, tenant })))
      .onConflictDoNothing();
  }
  await markAggregatesStale(db, tenant);
  await db
    .update(importJobs)
    .set({ status: "ready", error: null, updatedAt: new Date() })
    .where(and(eq(importJobs.tenant, tenant), eq(importJobs.id, job.id)));
}

/** True when the browser should recompute this tenant's aggregates. */
export async function aggregatesStale(db: Db, tenant: TenantId): Promise<boolean> {
  const rows = await db
    .select({ key: analyticsCache.key })
    .from(analyticsCache)
    .where(and(eq(analyticsCache.tenant, tenant), eq(analyticsCache.key, AGGREGATES_STALE_KEY)))
    .limit(1);
  return rows.length > 0;
}

/** One page of stays or journeys (no GPS paths) for the browser to aggregate. */
export async function aggregateInputPage(
  db: Db,
  tenant: TenantId,
  table: "visits" | "activities",
  afterId: number,
  limit = AGGREGATE_INPUT_PAGE,
) {
  if (table === "visits") {
    return db
      .select()
      .from(visits)
      .where(and(eq(visits.tenant, tenant), gt(visits.id, afterId)))
      .orderBy(asc(visits.id))
      .limit(limit);
  }
  return db
    .select({
      id: activities.id,
      tenant: activities.tenant,
      sourceId: activities.sourceId,
      start: activities.start,
      end: activities.end,
      date: activities.date,
      startLat: activities.startLat,
      startLon: activities.startLon,
      endLat: activities.endLat,
      endLon: activities.endLon,
      mode: activities.mode,
      distanceMeters: activities.distanceMeters,
      durationMinutes: activities.durationMinutes,
    })
    .from(activities)
    .where(and(eq(activities.tenant, tenant), gt(activities.id, afterId)))
    .orderBy(asc(activities.id))
    .limit(limit);
}

export type DayStatInput = {
  date: string;
  totalDistanceMiles: number;
  modes: Record<string, number>;
  clusters: string[];
  visitCount: number;
  activityCount: number;
};

/** Validate an aggregate write: day rows and/or analytics entries from the browser. */
export function checkAggregateWrite(body: unknown): Check<{
  reset: boolean;
  done: boolean;
  dayStats: DayStatInput[];
  analytics: [string, unknown][];
}> {
  if (!isObj(body)) return { ok: false, error: "JSON body required" };
  const days = body.dayStats ?? [];
  const entries = body.analytics ?? {};
  if (!Array.isArray(days) || days.length > AGGREGATE_DAY_BATCH) {
    return { ok: false, error: `dayStats must be a list of up to ${AGGREGATE_DAY_BATCH} days` };
  }
  if (!isObj(entries) || Object.keys(entries).length > 40) return { ok: false, error: "analytics must be an object of up to 40 keys" };
  const dayStatsOut: DayStatInput[] = [];
  for (const d of days) {
    if (
      !isObj(d) ||
      !day(d.date) ||
      !num(d.totalDistanceMiles, 0, 1e7) ||
      !(Number.isInteger(d.visitCount) && num(d.visitCount, 0, 1e6)) ||
      !(Number.isInteger(d.activityCount) && num(d.activityCount, 0, 1e6)) ||
      !isObj(d.modes) ||
      !Array.isArray(d.clusters) ||
      d.clusters.length > 500 ||
      !d.clusters.every((c) => str(c, 80)) ||
      !Object.entries(d.modes).every(([k, n]) => str(k, 40) && num(n, 0, 1e6))
    ) {
      return { ok: false, error: "day row invalid" };
    }
    dayStatsOut.push({
      date: d.date as string,
      totalDistanceMiles: d.totalDistanceMiles as number,
      modes: d.modes as Record<string, number>,
      clusters: d.clusters as string[],
      visitCount: d.visitCount as number,
      activityCount: d.activityCount as number,
    });
  }
  const analyticsOut: [string, unknown][] = [];
  for (const [key, data] of Object.entries(entries)) {
    if (!ANALYTICS_KEY.test(key) || key === AGGREGATES_STALE_KEY) return { ok: false, error: `analytics key not allowed: ${key.slice(0, 40)}` };
    if (data === null || data === undefined) continue;
    if (JSON.stringify(data).length > ANALYTICS_ENTRY_MAX_BYTES) return { ok: false, error: `analytics entry too large: ${key}` };
    analyticsOut.push([key, data]);
  }
  return { ok: true, value: { reset: body.reset === true, done: body.done === true, dayStats: dayStatsOut, analytics: analyticsOut } };
}

/**
 * Store one chunk of browser-computed aggregates. `reset` clears the old ones first
 * (first chunk); `done` clears the stale flag (last chunk).
 */
export async function writeAggregates(
  db: Db,
  tenant: TenantId,
  chunk: { reset: boolean; done: boolean; dayStats: DayStatInput[]; analytics: [string, unknown][] },
) {
  if (chunk.reset) {
    await db.delete(dayStats).where(eq(dayStats.tenant, tenant));
    await db
      .delete(analyticsCache)
      .where(and(eq(analyticsCache.tenant, tenant), sql`${analyticsCache.key} <> ${AGGREGATES_STALE_KEY}`));
  }
  if (chunk.dayStats.length) {
    // Same single-parameter bulk insert as appendImportRows (CPU budget).
    await db.execute(sql`
      insert into day_stats (tenant, date, total_distance_miles, modes, clusters, visit_count, activity_count)
      select ${tenant}, x.date, x."totalDistanceMiles", x.modes, x.clusters, x."visitCount", x."activityCount"
      from jsonb_to_recordset(${JSON.stringify(chunk.dayStats)}::jsonb) as x(
        date text, "totalDistanceMiles" real, modes jsonb, clusters jsonb, "visitCount" integer, "activityCount" integer)
      on conflict (tenant, date) do update set
        total_distance_miles = excluded.total_distance_miles, modes = excluded.modes, clusters = excluded.clusters,
        visit_count = excluded.visit_count, activity_count = excluded.activity_count`);
  }
  for (const [key, data] of chunk.analytics) {
    await db
      .insert(analyticsCache)
      .values({ tenant, key, data })
      .onConflictDoUpdate({
        target: [analyticsCache.tenant, analyticsCache.key],
        set: { data, updatedAt: new Date() },
      });
  }
  if (chunk.done) {
    await db
      .delete(analyticsCache)
      .where(and(eq(analyticsCache.tenant, tenant), eq(analyticsCache.key, AGGREGATES_STALE_KEY)));
  }
}

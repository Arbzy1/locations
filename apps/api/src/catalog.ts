import {
  activities,
  analyticsCache,
  createDb,
  dayStats,
  importJobs,
  lifeChapters,
  namedTrips,
  placeLabels,
  placeCache,
  visits,
  dataSources,
  and,
  eq,
  sql,
  desc,
  or,
  inArray,
  gte,
  lte,
  journeyTrace,
  thinTrace,
  haversineM,
  makeCoordPlaceKey,
  rebuildTenantAggregates,
  METERS_TO_MILES,
  type TenantId,
} from "@locations/db";

type Db = ReturnType<typeof createDb>;

async function hiddenPlaceKeySet(db: Db, tenant: TenantId): Promise<Set<string>> {
  const rows = await db
    .select({ placeKey: placeLabels.placeKey, hidden: placeLabels.hidden })
    .from(placeLabels)
    .where(eq(placeLabels.tenant, tenant));
  return new Set(rows.filter((r) => r.hidden).map((r) => r.placeKey));
}

/** Real-place keys start with `g:` (Google placeId) or `c:` (snapped position); anything else is a region. */
export function isRealPlaceKey(key: string): boolean {
  return key.startsWith("g:") || key.startsWith("c:");
}

type PlaceGroup = {
  key: string;
  region: string;
  count: number;
  duration: number;
  lat: number;
  lon: number;
  first: string;
  last: string;
  /** Most recent stay's exact position: Day View caches its street name under it. */
  repLat: number;
  repLon: number;
  semanticType: string;
};

/** Visits grouped by real place (or by region for older `cluster` keys). */
async function placeGroups(db: Db, tenant: TenantId, key?: string): Promise<PlaceGroup[]> {
  const byRegion = key !== undefined && !isRealPlaceKey(key);
  const keyCol = byRegion ? visits.cluster : visits.placeKey;
  const filters = [eq(visits.tenant, tenant), sql`${visits.placeKey} is not null`];
  if (key !== undefined) filters.push(eq(keyCol, key));
  const rows = await db
    .select({
      key: sql<string>`${keyCol}`,
      region: sql<string>`(array_agg(${visits.cluster} order by ${visits.start} desc))[1]`,
      count: sql<number>`count(*)::int`,
      duration: sql<number>`coalesce(sum(${visits.durationMinutes}), 0)`,
      lat: sql<number>`avg(${visits.lat})`,
      lon: sql<number>`avg(${visits.lon})`,
      first: sql<string>`min(${visits.date})`,
      last: sql<string>`max(${visits.date})`,
      repLat: sql<number>`(array_agg(${visits.lat} order by ${visits.start} desc))[1]`,
      repLon: sql<number>`(array_agg(${visits.lon} order by ${visits.start} desc))[1]`,
      semanticType: sql<string>`mode() within group (order by ${visits.semanticType})`,
    })
    .from(visits)
    .where(and(...filters))
    .groupBy(keyCol);
  return rows.map((r) => ({
    ...r,
    duration: Number(r.duration) || 0,
    lat: Number(r.lat),
    lon: Number(r.lon),
    repLat: Number(r.repLat),
    repLon: Number(r.repLon),
  }));
}

/**
 * Display names: the user's label, else the street-level name Day View cached for the
 * place, else Google's semantic type (Home, Work), else its coordinates. Cache only.
 */
async function placeDisplayNames(db: Db, tenant: TenantId, groups: PlaceGroup[]) {
  const labels = await db
    .select({ placeKey: placeLabels.placeKey, label: placeLabels.label })
    .from(placeLabels)
    .where(eq(placeLabels.tenant, tenant));
  const labelByKey = new Map(labels.map((l) => [l.placeKey, l.label]));

  const coordKey = (g: PlaceGroup) => makeCoordPlaceKey(g.repLat, g.repLon);
  const keys = [...new Set(groups.map(coordKey))];
  const cached = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await db
      .select({ placeId: placeCache.placeId, name: placeCache.name })
      .from(placeCache)
      .where(inArray(placeCache.placeId, keys.slice(i, i + 500)));
    for (const r of rows) if (r.name && r.name !== "Unknown") cached.set(r.placeId, r.name);
  }

  const names = new Map<string, string>();
  for (const g of groups) {
    const semantic = g.semanticType && g.semanticType !== "Unknown" ? g.semanticType : "";
    names.set(
      g.key,
      labelByKey.get(g.key) ||
        cached.get(coordKey(g)) ||
        semantic ||
        `Near ${g.lat.toFixed(3)}, ${g.lon.toFixed(3)}`,
    );
  }
  return names;
}

export async function listClusters(
  db: Db,
  tenant: TenantId,
  opts: { q?: string; sort?: string; limit?: number; cursor?: string },
) {
  const hidden = await hiddenPlaceKeySet(db, tenant);
  const groups = (await placeGroups(db, tenant)).filter((g) => !hidden.has(g.key));
  const names = await placeDisplayNames(db, tenant, groups);

  let list = groups.map((g) => ({
    cluster: g.key,
    region: g.region,
    label: names.get(g.key) ?? g.key,
    visits: g.count,
    duration_minutes: g.duration,
    lat: g.lat,
    lon: g.lon,
    first: g.first,
    last: g.last,
  }));

  const q = opts.q?.trim().slice(0, 80).toLowerCase();
  if (q && q.length >= 2) {
    list = list.filter((p) => p.label.toLowerCase().includes(q) || p.region.toLowerCase().includes(q));
  }

  const sort = opts.sort || "visits";
  list.sort((a, b) => {
    if (sort === "name") return a.label.localeCompare(b.label);
    if (sort === "duration") return b.duration_minutes - a.duration_minutes;
    return b.visits - a.visits;
  });

  if (opts.cursor) {
    const idx = list.findIndex((c) => c.cluster === opts.cursor);
    if (idx >= 0) list = list.slice(idx + 1);
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const page = list.slice(0, limit);
  const next = list.length > limit ? page[page.length - 1]?.cluster : null;
  return { clusters: page, cursor: next };
}

/** Visits filter for a place key: a real place, or a region for older links. */
function placeFilter(key: string) {
  return isRealPlaceKey(key) ? eq(visits.placeKey, key) : eq(visits.cluster, key);
}

export async function getCluster(db: Db, tenant: TenantId, key: string) {
  const placeKey = key.slice(0, 200);
  const hidden = await hiddenPlaceKeySet(db, tenant);
  const group = (await placeGroups(db, tenant, placeKey))[0];
  if (!group) return null;
  const names = await placeDisplayNames(db, tenant, [group]);

  const sample = await db
    .select({ start: visits.start, date: visits.date })
    .from(visits)
    .where(and(eq(visits.tenant, tenant), placeFilter(placeKey)))
    .limit(400);
  const hours = Array.from({ length: 24 }, () => 0);
  for (const v of sample) {
    const h = new Date(v.start).getUTCHours();
    if (!Number.isNaN(h)) hours[h] += 1;
  }

  // Corridors run region to region, so a place shows its region's routes.
  const region = isRealPlaceKey(placeKey) ? group.region : placeKey;
  const cacheRows = await db
    .select({ data: analyticsCache.data })
    .from(analyticsCache)
    .where(and(eq(analyticsCache.tenant, tenant), eq(analyticsCache.key, "corridors")))
    .limit(1);
  const cached = (cacheRows[0]?.data ?? []) as { from: string; to: string; count: number }[];
  const related = Array.isArray(cached)
    ? cached.filter((c) => c.from === region || c.to === region).slice(0, 12)
    : [];

  return {
    cluster: placeKey,
    region,
    label: names.get(group.key) ?? placeKey,
    hidden: hidden.has(placeKey),
    visits: group.count,
    duration_minutes: group.duration,
    lat: group.lat,
    lon: group.lon,
    first: group.first,
    last: group.last,
    hour_histogram: hours,
    corridors: related,
  };
}

export async function listClusterVisits(
  db: Db,
  tenant: TenantId,
  key: string,
  opts: { from?: string; to?: string; limit?: number; cursor?: string },
) {
  const placeKey = key.slice(0, 200);
  const filters = [eq(visits.tenant, tenant), placeFilter(placeKey)];
  if (opts.from) filters.push(gte(visits.date, opts.from));
  if (opts.to) filters.push(lte(visits.date, opts.to));
  if (opts.cursor) filters.push(sql`${visits.start} < ${opts.cursor}`);
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const rows = await db
    .select({
      date: visits.date,
      start: visits.start,
      end: visits.end,
      duration_minutes: visits.durationMinutes,
      semantic_type: visits.semanticType,
      lat: visits.lat,
      lon: visits.lon,
    })
    .from(visits)
    .where(and(...filters))
    .orderBy(desc(visits.start))
    .limit(limit);
  return {
    visits: rows,
    cursor: rows.length === limit ? rows[rows.length - 1]?.start : null,
  };
}

/** Journeys and GPS fixes this close to a deleted place go with it. */
export const PLACE_DELETE_RADIUS_M = 200;

/**
 * Privacy: remove a place from history. Deletes its stays, journeys that start or end
 * there, GPS fixes near it on other journeys, and its label; then rebuilds aggregates.
 */
export async function deletePlaceData(db: Db, tenant: TenantId, key: string) {
  const placeKey = key.slice(0, 200);
  if (!isRealPlaceKey(placeKey)) return { error: "Choose a single place to delete" as const, status: 400 as const };
  const group = (await placeGroups(db, tenant, placeKey))[0];
  if (!group) return { error: "Place not found" as const, status: 404 as const };
  const near = (lat: number, lon: number) =>
    haversineM(group.lat, group.lon, lat, lon) <= PLACE_DELETE_RADIUS_M;

  const removedVisits = await db
    .delete(visits)
    .where(and(eq(visits.tenant, tenant), eq(visits.placeKey, placeKey)))
    .returning({ id: visits.id });

  const journeys = await db
    .select({
      id: activities.id,
      startLat: activities.startLat,
      startLon: activities.startLon,
      endLat: activities.endLat,
      endLon: activities.endLon,
      path: activities.path,
    })
    .from(activities)
    .where(eq(activities.tenant, tenant));
  const dropIds: number[] = [];
  let trimmedPaths = 0;
  for (const j of journeys) {
    if (near(j.startLat, j.startLon) || near(j.endLat, j.endLon)) {
      dropIds.push(j.id);
      continue;
    }
    if (!j.path?.some(([lat, lon]) => near(lat, lon))) continue;
    const kept = j.path.filter(([lat, lon]) => !near(lat, lon));
    await db
      .update(activities)
      .set({ path: kept.length ? kept : null })
      .where(and(eq(activities.tenant, tenant), eq(activities.id, j.id)));
    trimmedPaths += 1;
  }
  for (let i = 0; i < dropIds.length; i += 500) {
    await db
      .delete(activities)
      .where(and(eq(activities.tenant, tenant), inArray(activities.id, dropIds.slice(i, i + 500))));
  }
  await db.delete(placeLabels).where(and(eq(placeLabels.tenant, tenant), eq(placeLabels.placeKey, placeKey)));
  await rebuildTenantAggregates(db, tenant);
  return { visitCount: removedVisits.length, activityCount: dropIds.length, trimmedPaths };
}

export async function getCorridorDetail(db: Db, tenant: TenantId, a: string, b: string) {
  const from = a.slice(0, 200);
  const to = b.slice(0, 200);
  const [left, right] = [from, to].sort();
  const days = await db
    .select({
      date: visits.date,
      start: visits.start,
      end: visits.end,
      cluster: visits.cluster,
      lat: visits.lat,
      lon: visits.lon,
    })
    .from(visits)
    .where(
      and(
        eq(visits.tenant, tenant),
        or(eq(visits.cluster, left), eq(visits.cluster, right)),
      ),
    )
    .orderBy(visits.start)
    .limit(2000);

  const acts = await db
    .select({
      date: activities.date,
      start: activities.start,
      end: activities.end,
      mode: activities.mode,
      duration_minutes: activities.durationMinutes,
      start_lat: activities.startLat,
      start_lon: activities.startLon,
      end_lat: activities.endLat,
      end_lon: activities.endLon,
    })
    .from(activities)
    .where(eq(activities.tenant, tenant))
    .limit(4000);

  const byDate = new Map<string, typeof days>();
  for (const v of days) {
    const list = byDate.get(v.date) ?? [];
    list.push(v);
    byDate.set(v.date, list);
  }
  const transitions: {
    date: string;
    from: string;
    to: string;
    mode: string;
    duration_minutes: number;
  }[] = [];
  let fromLat = 0;
  let fromLon = 0;
  let toLat = 0;
  let toLon = 0;
  let fromN = 0;
  let toN = 0;
  for (const v of days) {
    if (v.cluster === left) {
      fromLat += v.lat;
      fromLon += v.lon;
      fromN += 1;
    } else {
      toLat += v.lat;
      toLon += v.lon;
      toN += 1;
    }
  }
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (prev.cluster === next.cluster) continue;
      const pair = [prev.cluster, next.cluster].sort();
      if (pair[0] !== left || pair[1] !== right) continue;
      const act = acts.find((a) => a.date === date && a.start >= prev.start && a.start <= next.start);
      transitions.push({
        date,
        from: prev.cluster,
        to: next.cluster,
        mode: act?.mode || "unknown",
        duration_minutes: act?.duration_minutes ?? 0,
      });
    }
  }
  if (transitions.length === 0) return null;
  return {
    from: left,
    to: right,
    count: transitions.length,
    from_lat: fromN ? fromLat / fromN : null,
    from_lon: fromN ? fromLon / fromN : null,
    to_lat: toN ? toLat / toN : null,
    to_lon: toN ? toLon / toN : null,
    transitions: transitions.slice(0, 80),
  };
}

export async function getTripRange(db: Db, tenant: TenantId, start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return { error: "Invalid range" as const };
  }
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && dates.length < 14) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const visitRows = await db
    .select()
    .from(visits)
    .where(and(eq(visits.tenant, tenant), gte(visits.date, start), lte(visits.date, dates[dates.length - 1]!)))
    .orderBy(visits.start);
  const activityRows = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.tenant, tenant), gte(activities.date, start), lte(activities.date, dates[dates.length - 1]!)),
    )
    .orderBy(activities.start);
  const stats = await db
    .select()
    .from(dayStats)
    .where(and(eq(dayStats.tenant, tenant), gte(dayStats.date, start), lte(dayStats.date, dates[dates.length - 1]!)));
  const miles = stats.reduce((s, d) => s + (d.totalDistanceMiles || 0), 0);
  return {
    start,
    end: dates[dates.length - 1],
    dates,
    truncated: end > dates[dates.length - 1]!,
    total_miles: miles,
    visits: visitRows.map((v) => ({
      start: v.start,
      end: v.end,
      lat: v.lat,
      lon: v.lon,
      cluster: v.cluster,
      semantic_type: v.semanticType,
      duration_minutes: v.durationMinutes,
    })),
    activities: activityRows.map((a) => ({
      start: a.start,
      end: a.end,
      start_lat: a.startLat,
      start_lon: a.startLon,
      end_lat: a.endLat,
      end_lon: a.endLon,
      mode: a.mode,
      distance_meters: a.distanceMeters,
      duration_minutes: a.durationMinutes,
    })),
  };
}

const ROUTE_RANGE_MAX_DAYS = 366;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Every journey line in a date range, as recorded (GPS trace when the journey has
 * fixes, else a straight start-to-end line). No routing calls, so a whole year
 * loads quickly; lines are thinned more the longer the range.
 */
export async function getRouteLines(
  db: Db,
  tenant: TenantId,
  opts: { from: string; to: string; sourceIds?: string[] },
) {
  const { from } = opts;
  if (!ISO_DAY.test(from) || !ISO_DAY.test(opts.to) || from > opts.to) {
    return { error: "from and to must be YYYY-MM-DD with from <= to" as const };
  }
  const lastAllowed = addDays(from, ROUTE_RANGE_MAX_DAYS - 1);
  const to = opts.to > lastAllowed ? lastAllowed : opts.to;
  const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const minSpacingM = spanDays <= 2 ? 25 : spanDays <= 45 ? 120 : 350;

  const rows = await db
    .select({
      date: activities.date,
      start: activities.start,
      end: activities.end,
      startLat: activities.startLat,
      startLon: activities.startLon,
      endLat: activities.endLat,
      endLon: activities.endLon,
      mode: activities.mode,
      distanceMeters: activities.distanceMeters,
      sourceId: activities.sourceId,
      path: activities.path,
    })
    .from(activities)
    .where(and(eq(activities.tenant, tenant), gte(activities.date, from), lte(activities.date, to)))
    .orderBy(activities.start);
  const picked = opts.sourceIds?.length
    ? rows.filter((r) => r.sourceId && opts.sourceIds!.includes(r.sourceId))
    : rows;

  const modes: Record<string, { count: number; miles: number }> = {};
  const dates = new Set<string>();
  let totalMiles = 0;
  const lines = picked.map((a) => {
    const miles = a.distanceMeters * METERS_TO_MILES;
    totalMiles += miles;
    dates.add(a.date);
    const m = (modes[a.mode] ??= { count: 0, miles: 0 });
    m.count += 1;
    m.miles += miles;
    const trace = journeyTrace(a);
    const pts = trace
      ? thinTrace(trace, { minSpacingM, maxPoints: 200 })
      : [
          [a.startLat, a.startLon],
          [a.endLat, a.endLon],
        ];
    return {
      date: a.date,
      start: a.start,
      mode: a.mode,
      source_id: a.sourceId,
      recorded: Boolean(trace),
      miles: Math.round(miles * 10) / 10,
      coords: pts.map((p) => [round5(p[0]), round5(p[1])] as [number, number]),
    };
  });
  for (const m of Object.values(modes)) m.miles = Math.round(m.miles * 10) / 10;

  return {
    from,
    to,
    truncated: to !== opts.to,
    days: dates.size,
    total_miles: Math.round(totalMiles * 10) / 10,
    modes,
    lines,
  };
}

const HOTSPOT_RADIUS_DEFAULT_M = 150;
const HOTSPOT_RADIUS_MAX_M = 2000;
const HOTSPOT_DAYS_MAX = 400;

/** Days with a stay near a point (a hotspot), newest first, with time spent. */
/** Longest range a GPX or GeoJSON export covers (GPS paths make them large). */
export const EXPORT_PATH_RANGE_MAX_DAYS = 366;

/**
 * Stays and journeys for an export. CSV (stays only) may span everything; formats with
 * journey geometry need a range of at most a year.
 */
export async function getExportRows(
  db: Db,
  tenant: TenantId,
  opts: { from?: string; to?: string; journeys: boolean },
) {
  const from = opts.from?.trim() || "";
  const to = opts.to?.trim() || "";
  if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to)) || (from && to && from > to)) {
    return { error: "from and to must be YYYY-MM-DD with from <= to" as const };
  }
  if (opts.journeys) {
    if (!from || !to) return { error: "Choose a date range for GPX or GeoJSON" as const };
    if (to > addDays(from, EXPORT_PATH_RANGE_MAX_DAYS - 1)) {
      return { error: "GPX and GeoJSON exports cover up to a year at a time" as const };
    }
  }
  const visitFilters = [eq(visits.tenant, tenant)];
  if (from) visitFilters.push(gte(visits.date, from));
  if (to) visitFilters.push(lte(visits.date, to));
  const visitRows = await db
    .select({
      start: visits.start,
      end: visits.end,
      date: visits.date,
      lat: visits.lat,
      lon: visits.lon,
      durationMinutes: visits.durationMinutes,
      semanticType: visits.semanticType,
      placeKey: visits.placeKey,
      cluster: visits.cluster,
    })
    .from(visits)
    .where(and(...visitFilters))
    .orderBy(visits.start);
  if (!opts.journeys) return { visits: visitRows, journeys: [] };

  const journeyRows = await db
    .select({
      start: activities.start,
      end: activities.end,
      date: activities.date,
      startLat: activities.startLat,
      startLon: activities.startLon,
      endLat: activities.endLat,
      endLon: activities.endLon,
      mode: activities.mode,
      distanceMeters: activities.distanceMeters,
      path: activities.path,
    })
    .from(activities)
    .where(and(eq(activities.tenant, tenant), gte(activities.date, from), lte(activities.date, to)))
    .orderBy(activities.start);
  return { visits: visitRows, journeys: journeyRows };
}

export async function getHotspotDays(
  db: Db,
  tenant: TenantId,
  opts: { lat: number; lon: number; radiusM?: number },
) {
  const { lat, lon } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { error: "lat and lon are required" as const };
  }
  const radiusM = Math.min(
    HOTSPOT_RADIUS_MAX_M,
    Math.max(10, Number.isFinite(opts.radiusM) ? opts.radiusM! : HOTSPOT_RADIUS_DEFAULT_M),
  );
  const dLat = radiusM / 110_540;
  const dLon = radiusM / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const rows = await db
    .select({
      date: visits.date,
      start: visits.start,
      end: visits.end,
      lat: visits.lat,
      lon: visits.lon,
      cluster: visits.cluster,
      semanticType: visits.semanticType,
      durationMinutes: visits.durationMinutes,
    })
    .from(visits)
    .where(
      and(
        eq(visits.tenant, tenant),
        gte(visits.lat, lat - dLat),
        lte(visits.lat, lat + dLat),
        gte(visits.lon, lon - dLon),
        lte(visits.lon, lon + dLon),
      ),
    );

  const byDate = new Map<string, { minutes: number; visits: number; first: string; last: string }>();
  let totalMinutes = 0;
  for (const v of rows) {
    if (haversineM(lat, lon, v.lat, v.lon) > radiusM) continue;
    totalMinutes += v.durationMinutes;
    const day = byDate.get(v.date);
    if (!day) {
      byDate.set(v.date, { minutes: v.durationMinutes, visits: 1, first: v.start, last: v.end });
    } else {
      day.minutes += v.durationMinutes;
      day.visits += 1;
      if (v.start < day.first) day.first = v.start;
      if (v.end > day.last) day.last = v.end;
    }
  }
  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, d]) => ({
      date,
      minutes: Math.round(d.minutes),
      visits: d.visits,
      first: d.first,
      last: d.last,
    }));
  return {
    lat,
    lon,
    radius_m: radiusM,
    total_days: days.length,
    total_minutes: Math.round(totalMinutes),
    truncated: days.length > HOTSPOT_DAYS_MAX,
    days: days.slice(0, HOTSPOT_DAYS_MAX),
  };
}

export async function listNamedTrips(db: Db, tenant: TenantId) {
  return db.select().from(namedTrips).where(eq(namedTrips.tenant, tenant)).orderBy(desc(namedTrips.updatedAt));
}

export async function upsertNamedTrip(
  db: Db,
  tenant: TenantId,
  body: { id?: string; name: string; start: string; end: string; dates?: string[] },
) {
  const name = body.name.trim().slice(0, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(body.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.end)) {
    return { error: "Invalid trip" as const };
  }
  const id = body.id || crypto.randomUUID();
  const now = new Date();
  const dates = body.dates?.length ? body.dates : [body.start, body.end];
  const existing = body.id
    ? await db
        .select({ id: namedTrips.id })
        .from(namedTrips)
        .where(and(eq(namedTrips.tenant, tenant), eq(namedTrips.id, id)))
        .limit(1)
    : [];
  if (body.id && !existing[0]) return { error: "Not found" as const };
  if (existing[0]) {
    await db
      .update(namedTrips)
      .set({ name, start: body.start, end: body.end, dates, updatedAt: now })
      .where(and(eq(namedTrips.tenant, tenant), eq(namedTrips.id, id)));
  } else {
    await db.insert(namedTrips).values({
      id,
      tenant,
      name,
      start: body.start,
      end: body.end,
      dates,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { id, name, start: body.start, end: body.end, dates };
}

export async function deleteNamedTrip(db: Db, tenant: TenantId, id: string) {
  const rows = await db
    .delete(namedTrips)
    .where(and(eq(namedTrips.tenant, tenant), eq(namedTrips.id, id)))
    .returning({ id: namedTrips.id });
  if (!rows[0]) return { error: "Not found" as const };
  return { ok: true as const };
}

export async function listChapters(db: Db, tenant: TenantId) {
  return db.select().from(lifeChapters).where(eq(lifeChapters.tenant, tenant)).orderBy(lifeChapters.start);
}

export async function upsertChapter(
  db: Db,
  tenant: TenantId,
  body: { id?: string; name: string; start: string; end: string },
) {
  const name = body.name.trim().slice(0, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(body.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.end)) {
    return { error: "Invalid chapter" as const };
  }
  const id = body.id || crypto.randomUUID();
  const now = new Date();
  const existing = body.id
    ? await db
        .select({ id: lifeChapters.id })
        .from(lifeChapters)
        .where(and(eq(lifeChapters.tenant, tenant), eq(lifeChapters.id, id)))
        .limit(1)
    : [];
  if (body.id && !existing[0]) return { error: "Not found" as const };
  if (existing[0]) {
    await db
      .update(lifeChapters)
      .set({ name, start: body.start, end: body.end, updatedAt: now })
      .where(and(eq(lifeChapters.tenant, tenant), eq(lifeChapters.id, id)));
  } else {
    await db.insert(lifeChapters).values({
      id,
      tenant,
      name,
      start: body.start,
      end: body.end,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { id, name, start: body.start, end: body.end };
}

export async function deleteChapter(db: Db, tenant: TenantId, id: string) {
  const rows = await db
    .delete(lifeChapters)
    .where(and(eq(lifeChapters.tenant, tenant), eq(lifeChapters.id, id)))
    .returning({ id: lifeChapters.id });
  if (!rows[0]) return { error: "Not found" as const };
  return { ok: true as const };
}

export async function listImportJobs(db: Db, tenant: TenantId) {
  const rows = await db
    .select({
      id: importJobs.id,
      sourceId: importJobs.sourceId,
      status: importJobs.status,
      error: importJobs.error,
      visitCount: importJobs.visitCount,
      activityCount: importJobs.activityCount,
      parsedCount: importJobs.parsedCount,
      merge: importJobs.merge,
      chosenFile: importJobs.chosenFile,
      createdAt: importJobs.createdAt,
      updatedAt: importJobs.updatedAt,
    })
    .from(importJobs)
    .where(eq(importJobs.tenant, tenant))
    .orderBy(desc(importJobs.createdAt))
    .limit(100);
  return rows;
}

export async function staffTenantStats(db: Db, tenant: TenantId) {
  const [visitRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visits)
    .where(eq(visits.tenant, tenant));
  const [sourceRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dataSources)
    .where(eq(dataSources.tenant, tenant));
  const jobs = await db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      updatedAt: importJobs.updatedAt,
      parsedCount: importJobs.parsedCount,
      visitCount: importJobs.visitCount,
      error: importJobs.error,
    })
    .from(importJobs)
    .where(eq(importJobs.tenant, tenant))
    .orderBy(desc(importJobs.updatedAt))
    .limit(20);
  const now = Date.now();
  const recentJobs = jobs.map((j) => {
    const updated = j.updatedAt ? new Date(j.updatedAt).getTime() : now;
    const ageMinutes = Number.isFinite(updated)
      ? Math.max(0, Math.round((now - updated) / 60_000))
      : 0;
    return {
      id: j.id,
      status: j.status,
      ageMinutes,
      parsedCount: j.parsedCount ?? 0,
      visitCount: j.visitCount ?? 0,
      error: j.error,
    };
  });
  const stuckJobs = recentJobs.filter(
    (j) => (j.status === "pending" || j.status === "processing") && j.ageMinutes >= 15,
  );
  return {
    visitCount: visitRow?.count ?? 0,
    sourceCount: sourceRow?.count ?? 0,
    latestJobStatus: recentJobs[0]?.status ?? null,
    recentJobCount: recentJobs.length,
    stuckJobCount: stuckJobs.length,
    stuckJobs,
    recentJobs,
  };
}

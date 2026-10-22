import {
  createDb,
  createHttpDb,
  activities,
  analyticsCache,
  dataSources,
  dayStats,
  importJobs,
  exportJobs,
  visits,
  routeCache,
  placeCache,
  placeLabels,
  namedTrips,
  lifeChapters,
  userSettings,
  subscriptions,
  user,
  session,
  account,
  verification,
  makeRouteCacheKey,
  makeCoordPlaceKey,
  makeRailArc,
  makeTraceCacheKey,
  snapGeometry,
  journeyTrace,
  thinTrace,
  polylineLengthM,
  sampleAlongTrace,
  traceDeviation,
  journeyAccuracy,
  haversineM,
  METERS_TO_MILES,
  deleteSourceData,
  deleteDateRange,
  ensureDataSource,
  importSourceData,
  parseTimelineJson,
  detectTimelineFormat,
  datesFromParsed,
  importDayDiff,
  timezoneSkewWarning,
  rebuildHourOfWeekCache,
  and,
  eq,
  sql,
  desc,
  or,
  ilike,
  inArray,
  gte,
  gt,
  lte,
  lt,
  type RouteStep,
  type PathPoint,
  type ActivityRow,
  type VisitRow,
  type TenantId,
  type PlaceColorToken,
  type ImportJobStatus,
  type ExportJobStatus,
  type DistanceUnit,
  type MapBookmark,
  landmarkForPlaceId,
} from "@locations/db";
import type { Env } from "./env";

const OSRM_BASE_DEFAULT = "https://router.project-osrm.org/route/v1";
/** OSRM and Nominatim calls give up after this, so one slow upstream cannot hang a request. */
const EXTERNAL_FETCH_TIMEOUT_MS = 6000;
const NOMINATIM_DEFAULT = "https://nominatim.openstreetmap.org/reverse";

let OSRM_BASE = OSRM_BASE_DEFAULT;
let NOMINATIM = NOMINATIM_DEFAULT;

export function configureGeoEndpoints(env: { OSRM_BASE?: string; GEOCODE_BASE?: string }) {
  OSRM_BASE = env.OSRM_BASE || OSRM_BASE_DEFAULT;
  NOMINATIM = env.GEOCODE_BASE || NOMINATIM_DEFAULT;
}

const MODE_TO_PROFILE: Record<string, string> = {
  walking: "foot",
  cycling: "bike",
  car: "driving",
  bus: "driving",
  train: "driving",
  subway: "driving",
  unknown: "driving",
};
const SKIP = new Set(["flying", "train", "subway"]);

const MANEUVER_MAP = new Map<string, string>([
  ["turn|left", "Turn left"],
  ["turn|right", "Turn right"],
  ["turn|sharp left", "Sharp left"],
  ["turn|sharp right", "Sharp right"],
  ["turn|slight left", "Slight left"],
  ["turn|slight right", "Slight right"],
  ["turn|straight", "Continue straight"],
  ["new name|straight", "Continue"],
  ["depart|", "Depart"],
  ["arrive|", "Arrive"],
  ["continue|straight", "Continue straight"],
  ["roundabout|", "Roundabout"],
  ["exit roundabout|", "Exit roundabout"],
]);

function getDirection(maneuver: { type?: string; modifier?: string }): string {
  const type = maneuver.type ?? "";
  const modifier = maneuver.modifier;
  const exact = MANEUVER_MAP.get(`${type}|${modifier ?? ""}`);
  if (exact) return exact;
  const bare = MANEUVER_MAP.get(`${type}|`);
  if (bare) return modifier ? `${bare} (${modifier})` : bare;
  if (modifier) return modifier.replace("slight ", "bear ").replace(/\b\w/g, (c) => c.toUpperCase());
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseSteps(legs: Array<{ steps?: unknown[] }>): RouteStep[] {
  const steps: RouteStep[] = [];
  for (const leg of legs) {
    for (const step of (leg.steps ?? []) as Array<Record<string, unknown>>) {
      let name = (step.name as string) || "";
      const ref = (step.ref as string) || "";
      if (!name && ref) name = ref;
      if (!name) name = ((step.maneuver as { type?: string })?.type) || "road";
      if (ref && ref !== name) name = `${name} (${ref})`;
      const distance_m = Number(step.distance ?? 0);
      const duration_s = Number(step.duration ?? 0);
      const coords = ((step.geometry as { coordinates?: number[][] })?.coordinates) ?? [];
      const geometry = coords.map((c) => [c[1], c[0]] as [number, number]);
      const direction = getDirection((step.maneuver as { type?: string; modifier?: string }) ?? {});
      if (distance_m < 1 && !geometry.length) continue;
      steps.push({
        name,
        distance_meters: Math.round(distance_m * 10) / 10,
        duration_seconds: Math.round(duration_s * 10) / 10,
        direction,
        geometry,
      });
    }
  }
  return steps;
}

export function getDb(env: Env) {
  return createDb(env.DATABASE_URL);
}

/** Worker liveness helper. Never logs the connection string or query errors. */
export async function pingDatabase(env: Env): Promise<boolean> {
  if (!env.DATABASE_URL) return false;
  try {
    const db = createHttpDb(env.DATABASE_URL);
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function fetchRoute(
  db: ReturnType<typeof createDb>,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  mode: string,
): Promise<{ geometry: [number, number][]; steps: RouteStep[] }> {
  const fallback = {
    geometry: [[startLat, startLon], [endLat, endLon]] as [number, number][],
    steps: [] as RouteStep[],
  };
  if (SKIP.has(mode)) return fallback;

  const profile = MODE_TO_PROFILE[mode] ?? "driving";
  const key = makeRouteCacheKey(startLat, startLon, endLat, endLon, profile);
  const cached = await db.select().from(routeCache).where(eq(routeCache.key, key)).limit(1);
  if (cached[0]) return { geometry: cached[0].geometry, steps: cached[0].steps };

  const url =
    `${OSRM_BASE}/${profile}/${startLon},${startLat};${endLon},${endLat}` +
    `?overview=full&geometries=geojson&steps=true&annotations=duration,distance`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS) });
    if (!resp.ok) return fallback;
    const data = (await resp.json()) as {
      code?: string;
      routes?: Array<{ geometry: { coordinates: number[][] }; legs: Array<{ steps?: unknown[] }> }>;
    };
    if (data.code !== "Ok" || !data.routes?.length) return fallback;
    const route = data.routes[0];
    const geometry = route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]);
    const steps = parseSteps(route.legs ?? []);
    await db
      .insert(routeCache)
      .values({ key, geometry, steps })
      .onConflictDoUpdate({ target: routeCache.key, set: { geometry, steps } });
    return { geometry, steps };
  } catch {
    return fallback;
  }
}

/** Public OSRM rejects map-matching radii above ~30m. */
const OSRM_MATCH_RADIUS_M = 30;
/** Public OSRM rejects map matching with more than 10 coordinates, so long traces go in chunks. */
const OSRM_MATCH_CHUNK = 10;
const TRACE_MIN_SPACING_M = 40;
/** At most four chunked match requests per journey. */
const TRACE_MAX_MATCH_POINTS = 37;
const TRACE_MAX_VIA_POINTS = 25;
/** Modes OSRM has no network for: draw the recorded fixes as-is. */
const RAW_TRACE_MODES = new Set(["flying", "train", "subway"]);
/** Journeys join an adjacent stop with a straight hop only when it is this close. */
const SNAP_MAX_M = 500;

/**
 * How a journey line was drawn, from most to least trustworthy:
 * - `gps-road`: recorded GPS fixes snapped onto roads (OSRM map matching / via points)
 * - `gps`: straight lines between recorded GPS fixes
 * - `road-estimate`: no fixes; fastest road route between start and end
 * - `rail-arc`: no fixes; drawn curve between stations
 * - `straight`: no fixes and no road route
 */
export type RouteSource = "gps-road" | "gps" | "road-estimate" | "rail-arc" | "straight";

type RoutedLine = { geometry: [number, number][]; steps: RouteStep[] };
type RouteAttempt = RoutedLine | "rejected" | "error";
type OsrmLeg = { steps?: unknown[] };

function osrmMatchBase(): string {
  return OSRM_BASE.replace(/\/route\/v1\/?$/, "/match/v1");
}

async function osrmJson<T>(url: string): Promise<T | "error"> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS) });
    // OSRM answers 400 with a JSON code (NoMatch, NoRoute...) for definite failures.
    if (resp.status === 429 || resp.status >= 500) return "error";
    return (await resp.json()) as T;
  } catch {
    return "error";
  }
}

/** OSRM maneuver types; parseSteps uses one as the name of an unnamed road. */
const MANEUVER_TYPES = new Set([
  "depart", "arrive", "turn", "new name", "continue", "merge", "on ramp", "off ramp",
  "fork", "end of road", "use lane", "roundabout", "rotary", "roundabout turn",
  "exit roundabout", "exit rotary", "notification", "road",
]);

/**
 * Matched and via-point routes have one leg per GPS fix, so every fix adds an
 * Arrive + Depart pair. Keep the first Depart and last Arrive only, and blank
 * names that are really maneuver types so "via" lists show roads.
 */
export function joinLegSteps(steps: RouteStep[]): RouteStep[] {
  const out: RouteStep[] = [];
  steps.forEach((s, i) => {
    const isArrive = s.direction.startsWith("Arrive");
    const isDepart = s.direction.startsWith("Depart");
    if (isArrive && i < steps.length - 1) return;
    out.push({
      ...s,
      direction: isDepart && i > 0 ? "Continue" : s.direction,
      name: MANEUVER_TYPES.has(s.name) ? "" : s.name,
    });
  });
  return out;
}

/** A road line is believable when its length is close to what was recorded. */
export function plausibleRouteLength(routeM: number, referenceM: number): boolean {
  if (!(routeM > 0) || !(referenceM > 0)) return false;
  return routeM <= Math.max(referenceM * 1.5, referenceM + 1000) && routeM >= referenceM * 0.6;
}

function tracePointsForMatch(trace: PathPoint[]): PathPoint[] {
  return thinTrace(trace, { minSpacingM: TRACE_MIN_SPACING_M, maxPoints: TRACE_MAX_MATCH_POINTS });
}

/** route_cache key used for a journey trace (same thinning as fetchTraceRoute). */
export function traceRouteCacheKey(trace: PathPoint[], mode: string): string {
  return makeTraceCacheKey(tracePointsForMatch(trace), MODE_TO_PROFILE[mode] ?? "driving");
}

async function matchChunk(
  pts: PathPoint[],
  times: number[],
  profile: string,
): Promise<(RoutedLine & { distance: number }) | "rejected" | "error"> {
  const coords = pts.map((p) => `${p[1]},${p[0]}`).join(";");
  const radiuses = pts.map(() => OSRM_MATCH_RADIUS_M).join(";");
  const url =
    `${osrmMatchBase()}/${profile}/${coords}` +
    `?geometries=geojson&overview=full&steps=true&gaps=ignore` +
    `&timestamps=${times.join(";")}&radiuses=${radiuses}`;
  const data = await osrmJson<{
    code?: string;
    matchings?: Array<{ geometry: { coordinates: number[][] }; legs: OsrmLeg[]; distance: number }>;
    tracepoints?: Array<unknown | null>;
  }>(url);
  if (data === "error") return "error";
  if (data.code !== "Ok" || !data.matchings?.length) return "rejected";
  const matchedPoints = (data.tracepoints ?? []).filter(Boolean).length;
  if (matchedPoints < Math.max(2, Math.ceil(pts.length * 0.6))) return "rejected";
  return {
    distance: data.matchings.reduce((s, m) => s + m.distance, 0),
    geometry: data.matchings.flatMap((m) =>
      m.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]),
    ),
    steps: data.matchings.flatMap((m) => parseSteps(m.legs ?? [])),
  };
}

async function matchTrace(pts: PathPoint[], profile: string, referenceM: number): Promise<RouteAttempt> {
  // OSRM needs strictly increasing timestamps; minute-offset fixes can tie.
  const times: number[] = [];
  for (const p of pts) times.push(times.length ? Math.max(p[2], times[times.length - 1] + 1) : p[2]);
  const geometry: [number, number][] = [];
  const steps: RouteStep[] = [];
  let distance = 0;
  // Consecutive chunks share their boundary fix so the matched pieces join up.
  for (let from = 0; from < pts.length - 1; from += OSRM_MATCH_CHUNK - 1) {
    const to = from + OSRM_MATCH_CHUNK;
    const piece = await matchChunk(pts.slice(from, to), times.slice(from, to), profile);
    if (piece === "rejected" || piece === "error") return piece;
    geometry.push(...piece.geometry);
    steps.push(...piece.steps);
    distance += piece.distance;
  }
  if (!plausibleRouteLength(distance, referenceM)) return "rejected";
  return { geometry, steps };
}

async function routeViaTrace(pts: PathPoint[], profile: string, referenceM: number): Promise<RouteAttempt> {
  const via = thinTrace(pts, { minSpacingM: TRACE_MIN_SPACING_M, maxPoints: TRACE_MAX_VIA_POINTS });
  const coords = via.map((p) => `${p[1]},${p[0]}`).join(";");
  const url =
    `${OSRM_BASE}/${profile}/${coords}` +
    `?overview=full&geometries=geojson&steps=true&continue_straight=false`;
  const data = await osrmJson<{
    code?: string;
    routes?: Array<{ geometry: { coordinates: number[][] }; legs: OsrmLeg[]; distance: number }>;
  }>(url);
  if (data === "error") return "error";
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route) return "rejected";
  if (!plausibleRouteLength(route.distance, referenceM)) return "rejected";
  return {
    geometry: route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]),
    steps: parseSteps(route.legs ?? []),
  };
}

/**
 * Road route that follows a journey's recorded GPS fixes: OSRM map matching first,
 * then a route through the fixes as via points. Either is dropped when it strays
 * far from the recorded distance (the public OSRM server routes walks as a car).
 * Definite answers, including "no believable road route", are cached by trace hash.
 */
export async function fetchTraceRoute(
  db: ReturnType<typeof createDb>,
  trace: PathPoint[],
  mode: string,
  recordedDistanceM = 0,
): Promise<RoutedLine | null> {
  const profile = MODE_TO_PROFILE[mode] ?? "driving";
  const pts = tracePointsForMatch(trace);
  if (pts.length < 2) return null;
  const key = makeTraceCacheKey(pts, profile);
  const cached = await db.select().from(routeCache).where(eq(routeCache.key, key)).limit(1);
  if (cached[0]) {
    return cached[0].geometry.length ? { geometry: cached[0].geometry, steps: cached[0].steps } : null;
  }

  const referenceM = Math.max(polylineLengthM(pts), recordedDistanceM || 0);
  let attempt = await matchTrace(pts, profile, referenceM);
  if (attempt === "rejected") attempt = await routeViaTrace(pts, profile, referenceM);
  if (attempt === "error") return null;

  const line =
    attempt === "rejected"
      ? { geometry: [], steps: [] }
      : { geometry: attempt.geometry, steps: joinLegSteps(attempt.steps) };
  await db
    .insert(routeCache)
    .values({ key, geometry: line.geometry, steps: line.steps })
    .onConflictDoUpdate({ target: routeCache.key, set: { geometry: line.geometry, steps: line.steps } });
  return line.geometry.length ? line : null;
}

type LatLon = [number, number];

/**
 * Where a journey really started (or ended). Timeline's recorded endpoint is
 * sometimes kilometres off; when the adjacent stop sits closer to the first (or
 * last) GPS fix, trust the stop instead.
 */
export function journeyAnchor(recorded: LatLon, stop: LatLon | null, fix: PathPoint | undefined): LatLon {
  if (!stop || !fix) return recorded;
  if (haversineM(recorded[0], recorded[1], stop[0], stop[1]) <= SNAP_MAX_M) return recorded;
  return haversineM(stop[0], stop[1], fix[0], fix[1]) < haversineM(recorded[0], recorded[1], fix[0], fix[1])
    ? stop
    : recorded;
}

/** Best available line for one journey, before snapping to neighbouring stops. */
export async function routeActivity(
  db: ReturnType<typeof createDb>,
  a: ActivityRow,
  anchors?: { start: LatLon; end: LatLon },
): Promise<RoutedLine & { source: RouteSource; gpsPoints: number }> {
  const gpsPoints = a.path?.length ?? 0;
  const trace = journeyTrace(
    anchors
      ? { ...a, startLat: anchors.start[0], startLon: anchors.start[1], endLat: anchors.end[0], endLon: anchors.end[1] }
      : a,
  );
  if (trace && trace.length >= 3) {
    if (!RAW_TRACE_MODES.has(a.mode)) {
      const road = await fetchTraceRoute(db, trace, a.mode, a.distanceMeters);
      if (road) return { ...road, source: "gps-road", gpsPoints };
    }
    return {
      geometry: trace.map((p) => [p[0], p[1]] as [number, number]),
      steps: [],
      source: "gps",
      gpsPoints,
    };
  }
  if (a.mode === "train" || a.mode === "subway") {
    return { geometry: [], steps: [], source: "rail-arc", gpsPoints };
  }
  const estimate = await fetchRoute(db, a.startLat, a.startLon, a.endLat, a.endLon, a.mode);
  return {
    ...estimate,
    source: estimate.steps.length ? "road-estimate" : "straight",
    gpsPoints,
  };
}

/** Routing mode for a gap with no recorded journey, guessed from implied speed. */
export function connectorMode(gapM: number, fromIso: string, toIso: string): string {
  const hours = (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;
  if (gapM <= 5000 && hours > 0 && gapM / 1000 / hours <= 7) return "walking";
  return "car";
}

const NOMINATIM_UA = "LocationExplorer/1.0 (portfolio; contact via aden.website)";

/** Settlement / locality fields from Nominatim addressdetails, preferred first. */
const SETTLEMENT_KEYS = [
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "city_district",
  "suburb",
  "neighbourhood",
  "quarter",
  "county",
] as const;

function settlementFromAddress(address: Record<string, string> | undefined): string | null {
  if (!address) return null;
  for (const key of SETTLEMENT_KEYS) {
    const value = (address[key] || "").trim();
    if (value) return value;
  }
  return null;
}

function makeSettlementPlaceKey(lat: number, lon: number): string {
  return `settlement:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export async function resolveCoords(
  db: ReturnType<typeof createDb>,
  lat: number,
  lon: number,
): Promise<{ name: string; address: string; data: Record<string, unknown> }> {
  const key = makeCoordPlaceKey(lat, lon);
  const cached = await db.select().from(placeCache).where(eq(placeCache.placeId, key)).limit(1);
  if (cached[0]) {
    return { name: cached[0].name, address: cached[0].address, data: cached[0].data };
  }

  try {
    const url = `${NOMINATIM}?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;
    const resp = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_UA },
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return { name: "Unknown", address: "", data: {} };
    const data = (await resp.json()) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    };
    const name =
      data.name ||
      data.address?.amenity ||
      data.address?.shop ||
      data.address?.tourism ||
      data.address?.building ||
      data.address?.road ||
      "Unknown";
    const address = data.display_name ?? "";
    const payload = { address: data.address ?? {}, raw: data };
    await db
      .insert(placeCache)
      .values({ placeId: key, name, address, data: payload })
      .onConflictDoUpdate({
        target: placeCache.placeId,
        set: { name, address, data: payload },
      });
    return { name, address, data: payload };
  } catch {
    return { name: "Unknown", address: "", data: {} };
  }
}

/**
 * Guess town / city / village for coordinates via Nominatim (cached).
 * Reuses street-level place_cache address details when present to avoid extra fetches.
 */
export async function resolveSettlement(
  db: ReturnType<typeof createDb>,
  lat: number,
  lon: number,
  opts?: { allowLive?: boolean },
): Promise<{ settlement: string | null; fetched: boolean }> {
  const allowLive = opts?.allowLive ?? true;
  const settlementKey = makeSettlementPlaceKey(lat, lon);

  const cachedSettlement = await db
    .select()
    .from(placeCache)
    .where(eq(placeCache.placeId, settlementKey))
    .limit(1);
  if (cachedSettlement[0]?.name && cachedSettlement[0].name !== "Unknown") {
    return { settlement: cachedSettlement[0].name, fetched: false };
  }

  const streetKey = makeCoordPlaceKey(lat, lon);
  const streetCached = await db
    .select()
    .from(placeCache)
    .where(eq(placeCache.placeId, streetKey))
    .limit(1);
  if (streetCached[0]) {
    const addr = (streetCached[0].data as { address?: Record<string, string> } | null)?.address;
    const fromStreet = settlementFromAddress(addr);
    if (fromStreet) {
      await db
        .insert(placeCache)
        .values({
          placeId: settlementKey,
          name: fromStreet,
          address: streetCached[0].address,
          data: { address: addr ?? {}, source: "street_cache" },
        })
        .onConflictDoUpdate({
          target: placeCache.placeId,
          set: { name: fromStreet, address: streetCached[0].address },
        });
      return { settlement: fromStreet, fetched: false };
    }
  }

  if (!allowLive) return { settlement: null, fetched: false };

  try {
    // zoom ~14 prefers locality over a single building / POI
    const url = `${NOMINATIM}?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=14`;
    const resp = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_UA },
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return { settlement: null, fetched: true };
    const data = (await resp.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const settlement = settlementFromAddress(data.address);
    if (!settlement) return { settlement: null, fetched: true };
    const address = data.display_name ?? "";
    await db
      .insert(placeCache)
      .values({
        placeId: settlementKey,
        name: settlement,
        address,
        data: { address: data.address ?? {}, source: "nominatim_settlement" },
      })
      .onConflictDoUpdate({
        target: placeCache.placeId,
        set: { name: settlement, address, data: { address: data.address ?? {} } },
      });
    return { settlement, fetched: true };
  } catch {
    return { settlement: null, fetched: true };
  }
}

/** Where a stay is drawn: the GPS-fix median when recorded, else Google's place. */
export function stayPosition(v: Pick<VisitRow, "lat" | "lon" | "fixLat" | "fixLon" | "fixCount">): LatLon {
  return v.fixCount && v.fixCount >= 2 && v.fixLat != null && v.fixLon != null
    ? [v.fixLat, v.fixLon]
    : [v.lat, v.lon];
}

function visitToApi(v: VisitRow) {
  const [lat, lon] = stayPosition(v);
  return {
    start: v.start,
    end: v.end,
    lat,
    lon,
    place_lat: v.lat,
    place_lon: v.lon,
    fix_count: v.fixCount ?? 0,
    moved_m: Math.round(haversineM(v.lat, v.lon, lat, lon)),
    cluster: v.cluster,
    semantic_type: v.semanticType,
    place_id: v.placeId,
    duration_minutes: v.durationMinutes,
    source_id: v.sourceId,
  };
}

function activityToApi(a: ActivityRow) {
  return {
    start: a.start,
    end: a.end,
    start_lat: a.startLat,
    start_lon: a.startLon,
    end_lat: a.endLat,
    end_lon: a.endLon,
    mode: a.mode,
    distance_meters: a.distanceMeters,
    duration_minutes: a.durationMinutes,
    source_id: a.sourceId,
  };
}

export async function getOverview(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const [visitCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visits)
    .where(eq(visits.tenant, tenant));
  const [activityCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(eq(activities.tenant, tenant));
  const [distRow] = await db
    .select({ total: sql<number>`coalesce(sum(${dayStats.totalDistanceMiles}), 0)` })
    .from(dayStats)
    .where(eq(dayStats.tenant, tenant));
  const dates = await db
    .select({ date: dayStats.date })
    .from(dayStats)
    .where(eq(dayStats.tenant, tenant))
    .orderBy(dayStats.date);
  const [places] = await db
    .select({ count: sql<number>`count(distinct ${visits.placeId})::int` })
    .from(visits)
    .where(and(eq(visits.tenant, tenant), sql`${visits.placeId} is not null`));

  const allDates = dates.map((d) => d.date);
  return {
    total_records: (visitCount?.count ?? 0) + (activityCount?.count ?? 0),
    total_visits: visitCount?.count ?? 0,
    total_activities: activityCount?.count ?? 0,
    total_distance_miles: Math.round((distRow?.total ?? 0) * 10) / 10,
    date_range: allDates.length
      ? ([allDates[0], allDates[allDates.length - 1]] as [string, string])
      : (["", ""] as [string, string]),
    days_with_data: allDates.length,
    unique_places: places?.count ?? 0,
  };
}

export async function getDays(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db
    .select({
      date: dayStats.date,
      totalDistanceMiles: dayStats.totalDistanceMiles,
      modes: dayStats.modes,
      visitCount: dayStats.visitCount,
      activityCount: dayStats.activityCount,
    })
    .from(dayStats)
    .where(eq(dayStats.tenant, tenant))
    .orderBy(dayStats.date);
  return rows.map((r) => ({
    date: r.date,
    total_distance_miles: r.totalDistanceMiles,
    modes: r.modes,
    visit_count: r.visitCount,
    activity_count: r.activityCount,
  }));
}

export async function getHeatmap(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  opts?: { sourceIds?: string[]; from?: string; to?: string },
) {
  const filters = [eq(visits.tenant, tenant)];
  if (opts?.sourceIds?.length) filters.push(inArray(visits.sourceId, opts.sourceIds));
  if (opts?.from) filters.push(gte(visits.date, opts.from));
  if (opts?.to) filters.push(lte(visits.date, opts.to));

  const rows = await db
    .select({
      lat: visits.lat,
      lon: visits.lon,
      cluster: visits.cluster,
      semanticType: visits.semanticType,
      durationMinutes: visits.durationMinutes,
      date: visits.date,
    })
    .from(visits)
    .where(and(...filters));

  type Cell = {
    lat: number;
    lon: number;
    count: number;
    totalDurationMinutes: number;
    days: Set<string>;
    clusters: Map<string, number>;
    types: Map<string, number>;
  };

  const cells = new Map<string, Cell>();

  for (const r of rows) {
    const lat = Math.round(r.lat * 1e5) / 1e5;
    const lon = Math.round(r.lon * 1e5) / 1e5;
    const key = `${lat},${lon}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        lat,
        lon,
        count: 0,
        totalDurationMinutes: 0,
        days: new Set(),
        clusters: new Map(),
        types: new Map(),
      };
      cells.set(key, cell);
    }
    cell.count += 1;
    cell.totalDurationMinutes += r.durationMinutes ?? 0;
    if (r.date) cell.days.add(r.date);
    const cluster = (r.cluster || "").trim();
    if (cluster) cell.clusters.set(cluster, (cell.clusters.get(cluster) ?? 0) + 1);
    const sem = (r.semanticType || "").trim();
    if (sem) cell.types.set(sem, (cell.types.get(sem) ?? 0) + 1);
  }

  const topKey = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const points = [...cells.values()]
    .map((cell) => {
      const clusterRank = topKey(cell.clusters);
      const typeRank = topKey(cell.types).filter((t) => t !== "Unknown");
      const types =
        typeRank.length > 0 ? typeRank.slice(0, 3) : topKey(cell.types).slice(0, 3);
      const cluster = clusterRank[0] || "";
      const coordFallback = `Near ${cell.lat.toFixed(4)}, ${cell.lon.toFixed(4)}`;
      return {
        lat: cell.lat,
        lon: cell.lon,
        count: cell.count,
        label: cluster || coordFallback,
        cluster,
        totalDurationMinutes: Math.round(cell.totalDurationMinutes),
        uniqueDays: cell.days.size,
        topTypes: types,
        settlement: null as string | null,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Enrich top hotspots with settlement names (cache first; limited live Nominatim).
  const TOP_SETTLEMENT = 20;
  const MAX_LIVE_SETTLEMENT = 8;
  let liveLookups = 0;
  for (const point of points.slice(0, TOP_SETTLEMENT)) {
    const { settlement, fetched } = await resolveSettlement(db, point.lat, point.lon, {
      allowLive: liveLookups < MAX_LIVE_SETTLEMENT,
    });
    if (fetched) liveLookups += 1;
    if (settlement) {
      point.settlement = settlement;
      if (!point.cluster) {
        point.label = settlement;
      }
    }
  }

  const hidden = await hiddenPlaceKeySet(db, tenant);

  return points
    .filter((p) => {
      const coordKey = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      return !hidden.has(p.cluster) && !hidden.has(coordKey) && !hidden.has(p.label);
    })
    .map(({ cluster, ...rest }) => ({ ...rest, cluster: cluster || undefined }));
}

export async function getAnalytics(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  key: string,
) {
  const rows = await db
    .select()
    .from(analyticsCache)
    .where(and(eq(analyticsCache.tenant, tenant), eq(analyticsCache.key, key)))
    .limit(1);
  const data = rows[0]?.data ?? [];
  const hidden = await hiddenPlaceKeySet(db, tenant);
  return filterHiddenAnalytics(key, data, hidden);
}

function isHiddenCluster(name: string, hidden: Set<string>): boolean {
  return hidden.has(name);
}

function filterYearChapter(chapter: unknown, hidden: Set<string>): unknown {
  if (!chapter || typeof chapter !== "object" || Array.isArray(chapter)) return chapter;
  const row = chapter as {
    top_places?: [string, number][];
    firsts?: { cluster: string; date: string }[];
    trips?: { clusters?: string[] }[];
  };
  return {
    ...row,
    top_places: (row.top_places ?? []).filter(([name]) => !isHiddenCluster(name, hidden)),
    firsts: (row.firsts ?? []).filter((f) => !isHiddenCluster(f.cluster, hidden)),
    trips: (row.trips ?? []).map((t) => ({
      ...t,
      clusters: (t.clusters ?? []).filter((c) => !isHiddenCluster(c, hidden)),
    })),
  };
}

export function filterHiddenAnalytics(key: string, data: unknown, hidden: Set<string>): unknown {
  if (!hidden.size) return data;
  if (key === "lapsed-places" && Array.isArray(data)) {
    return data.filter(
      (row) =>
        row &&
        typeof row === "object" &&
        "cluster" in row &&
        !isHiddenCluster(String((row as { cluster: string }).cluster), hidden),
    );
  }
  if (key === "place-deltas" && Array.isArray(data)) {
    return data.map((row) => {
      if (!row || typeof row !== "object") return row;
      const m = row as { newClusters?: string[]; returnedClusters?: string[] };
      return {
        ...m,
        newClusters: (m.newClusters ?? []).filter((c) => !isHiddenCluster(c, hidden)),
        returnedClusters: (m.returnedClusters ?? []).filter((c) => !isHiddenCluster(c, hidden)),
      };
    });
  }
  if (key === "firsts" && data && typeof data === "object" && !Array.isArray(data) && "clusters" in data) {
    const row = data as { clusters: { name: string }[]; types?: unknown };
    return {
      ...row,
      clusters: (row.clusters ?? []).filter((c) => !isHiddenCluster(c.name, hidden)),
    };
  }
  if (key === "year-in-review") {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) return data;
    if ("year" in data) return filterYearChapter(data, hidden);
    const out: Record<string, unknown> = {};
    for (const [year, chapter] of Object.entries(data as Record<string, unknown>)) {
      out[year] = filterYearChapter(chapter, hidden);
    }
    return out;
  }
  if (key.startsWith("year-in-review:")) return filterYearChapter(data, hidden);
  return data;
}

export async function getRouteProgress(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const { candidates, cachedKeys } = await loadRouteCandidates(db, tenant);
  const total = new Set(candidates.map((c) => c.key)).size;
  const cached = cachedKeys.size;
  return {
    running: false,
    total,
    cached,
    errors: 0,
    percent: Math.round((cached / Math.max(total, 1)) * 1000) / 10,
  };
}

export type DayProgressEvent = {
  stage: string;
  detail?: string;
  percent: number;
  done?: number;
  total?: number;
};

/** Live Nominatim lookups allowed per Day View for "via" places (cache hits are free). */
const MAX_LIVE_VIA_LOOKUPS = 10;
const VIA_SAMPLE_EVERY_M = 2500;
const VIA_SAMPLES_MAX = 5;

/**
 * Towns or areas a recorded journey passed through, in order, without the
 * places it started and ended in.
 */
export async function placesAlongTrace(
  db: ReturnType<typeof createDb>,
  trace: PathPoint[],
  budget: { live: number },
): Promise<string[]> {
  const samples = sampleAlongTrace(trace, VIA_SAMPLE_EVERY_M, VIA_SAMPLES_MAX);
  if (!samples.length) return [];
  const points: [number, number][] = [
    [trace[0][0], trace[0][1]],
    ...samples,
    [trace[trace.length - 1][0], trace[trace.length - 1][1]],
  ];
  const names: (string | null)[] = [];
  for (const [lat, lon] of points) {
    const { settlement, fetched } = await resolveSettlement(db, lat, lon, { allowLive: budget.live > 0 });
    if (fetched) budget.live -= 1;
    names.push(settlement);
  }
  const ends = new Set([names[0], names[names.length - 1]].filter(Boolean));
  const via: string[] = [];
  for (const name of names.slice(1, -1)) {
    if (name && !ends.has(name) && via[via.length - 1] !== name) via.push(name);
  }
  return via;
}

export async function getDay(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  date: string,
  onProgress?: (event: DayProgressEvent) => void | Promise<void>,
  sourceIds?: string[],
  opts?: { compare?: boolean },
) {
  const report = async (event: DayProgressEvent) => {
    await onProgress?.(event);
  };

  await report({ stage: "Loading day records", detail: date, percent: 2 });

  const dayRows = await db
    .select()
    .from(dayStats)
    .where(and(eq(dayStats.tenant, tenant), eq(dayStats.date, date)))
    .limit(1);
  const day = dayRows[0];
  if (!day) return { error: "No data for this date" };

  const dayVisitsRaw = await db
    .select()
    .from(visits)
    .where(
      and(
        eq(visits.tenant, tenant),
        or(eq(visits.date, date), and(lt(visits.date, date), gte(visits.end, date))),
      ),
    )
    .orderBy(visits.start);
  const dayActivitiesRaw = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenant, tenant),
        or(eq(activities.date, date), and(lt(activities.date, date), gte(activities.end, date))),
      ),
    )
    .orderBy(activities.start);

  const dayVisits = sourceIds?.length
    ? dayVisitsRaw.filter((v) => v.sourceId && sourceIds.includes(v.sourceId))
    : dayVisitsRaw;
  const dayActivities = sourceIds?.length
    ? dayActivitiesRaw.filter((a) => a.sourceId && sourceIds.includes(a.sourceId))
    : dayActivitiesRaw;

  await report({
    stage: "Building timeline",
    detail: `${dayVisits.length} visits · ${dayActivities.length} journeys`,
    percent: 8,
  });

  type Event =
    | {
        time: string;
        end_time: string;
        type: "visit";
        lat: number;
        lon: number;
        data: VisitRow;
      }
    | {
        time: string;
        end_time: string;
        type: "activity";
        start_lat: number;
        start_lon: number;
        end_lat: number;
        end_lon: number;
        data: ActivityRow;
      };

  const events: Event[] = [];
  for (const v of dayVisits) {
    const [lat, lon] = stayPosition(v);
    events.push({
      time: v.start,
      end_time: v.end,
      type: "visit",
      lat,
      lon,
      data: v,
    });
  }
  for (const a of dayActivities) {
    events.push({
      time: a.start,
      end_time: a.end,
      type: "activity",
      start_lat: a.startLat,
      start_lon: a.startLon,
      end_lat: a.endLat,
      end_lon: a.endLon,
      data: a,
    });
  }
  events.sort((a, b) => a.time.localeCompare(b.time));

  const activityTotal = dayActivities.length;
  let activityDone = 0;

  const adjacentStop = (neighbour: Event | undefined): LatLon | null =>
    neighbour?.type === "visit" ? [neighbour.lat, neighbour.lon] : null;
  // A journey line hops to a stop only when that stop is the very next/previous
  // event and close by. Otherwise the jump stays visible as unknown movement.
  const snapTo = (stop: LatLon | null, at: LatLon): LatLon | null =>
    stop && haversineM(stop[0], stop[1], at[0], at[1]) <= SNAP_MAX_M ? stop : null;
  const snappedStart = new Set<ActivityRow>();
  const snappedEnd = new Set<ActivityRow>();
  /** Where each journey line is actually drawn from and to, for gap lines. */
  const drawnEnds = new Map<ActivityRow, { start: LatLon; end: LatLon }>();

  const viaBudget = { live: MAX_LIVE_VIA_LOOKUPS };
  const enrichedActivities = [];
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx];
    if (ev.type !== "activity") continue;
    const a = ev.data;
    activityDone += 1;
    const pct =
      activityTotal === 0
        ? 50
        : 8 + Math.round((activityDone / activityTotal) * 42);
    await report({
      stage: "Routing journeys",
      detail: `${a.mode}${a.path?.length ? " via GPS" : ""} (${activityDone}/${activityTotal})`,
      percent: pct,
      done: activityDone,
      total: activityTotal,
    });

    const prevStop = adjacentStop(events[idx - 1]);
    const nextStop = adjacentStop(events[idx + 1]);
    const anchors = {
      start: journeyAnchor([a.startLat, a.startLon], prevStop, a.path?.[0]),
      end: journeyAnchor([a.endLat, a.endLon], nextStop, a.path?.at(-1)),
    };
    const route = await routeActivity(db, a, anchors);
    const d = activityToApi(a) as Record<string, unknown>;

    const snapStart = snapTo(prevStop, anchors.start);
    const snapEnd = snapTo(nextStop, anchors.end);
    if (snapStart) snappedStart.add(a);
    if (snapEnd) snappedEnd.add(a);
    const [snapStartLat, snapStartLon] = snapStart ?? anchors.start;
    const [snapEndLat, snapEndLon] = snapEnd ?? anchors.end;
    drawnEnds.set(a, { start: [snapStartLat, snapStartLon], end: [snapEndLat, snapEndLon] });

    d.route_geometry =
      route.source === "rail-arc"
        ? makeRailArc(snapStartLat, snapStartLon, snapEndLat, snapEndLon)
        : snapGeometry(route.geometry, snapStartLat, snapStartLon, snapEndLat, snapEndLon);
    d.steps = route.steps;
    d.has_osrm_route = route.steps.length > 0;
    d.is_rail = a.mode === "train" || a.mode === "subway";
    d.route_source = route.source;
    d.gps_points = route.gpsPoints;

    // What the phone recorded, joined to the same stops as the drawn line.
    const recorded = journeyTrace({
      ...a,
      startLat: anchors.start[0],
      startLon: anchors.start[1],
      endLat: anchors.end[0],
      endLon: anchors.end[1],
    });
    d.recorded_geometry = recorded
      ? snapGeometry(
          recorded.map((p) => [p[0], p[1]] as [number, number]),
          snapStartLat,
          snapStartLon,
          snapEndLat,
          snapEndLon,
        )
      : null;
    d.accuracy = journeyAccuracy({
      path: a.path,
      startS: Date.parse(a.start) / 1000,
      endS: Date.parse(a.end) / 1000,
      drawnLine: d.route_geometry as [number, number][],
    });

    if (opts?.compare) {
      const predicted =
        a.mode === "train" || a.mode === "subway"
          ? makeRailArc(snapStartLat, snapStartLon, snapEndLat, snapEndLon)
          : snapGeometry(
              (await fetchRoute(db, a.startLat, a.startLon, a.endLat, a.endLon, a.mode)).geometry,
              snapStartLat,
              snapStartLon,
              snapEndLat,
              snapEndLon,
            );
      d.predicted_geometry = predicted;
      d.prediction_gap = a.path?.length ? traceDeviation(a.path, predicted) : null;
    }

    d.via_places = recorded ? await placesAlongTrace(db, recorded, viaBudget) : [];

    let fromPlace: string | null = null;
    for (let j = idx - 1; j >= 0; j--) {
      const prev = events[j];
      if (prev.type === "visit") {
        fromPlace = prev.data.cluster;
        break;
      }
    }
    let toPlace: string | null = null;
    for (let j = idx + 1; j < events.length; j++) {
      const next = events[j];
      if (next.type === "visit") {
        toPlace = next.data.cluster;
        break;
      }
    }
    d.from_place = fromPlace;
    d.to_place = toPlace;
    enrichedActivities.push(d);
  }

  const connectorCandidates: Array<{
    fromLat: number;
    fromLon: number;
    toLat: number;
    toLon: number;
    gapM: number;
    from_time: string;
    to_time: string;
    from_label: string;
    to_label: string;
  }> = [];
  for (let i = 0; i < events.length - 1; i++) {
    const prevEv = events[i];
    const nextEv = events[i + 1];
    // Already joined by the journey line itself.
    if (prevEv.type === "activity" && nextEv.type === "visit" && snappedEnd.has(prevEv.data)) continue;
    if (prevEv.type === "visit" && nextEv.type === "activity" && snappedStart.has(nextEv.data)) continue;
    // Overlapping events (Timeline nests stays inside longer ones): nothing moved in between.
    if (Date.parse(nextEv.time) < Date.parse(prevEv.end_time) - 60_000) continue;
    const [fromLat, fromLon] =
      prevEv.type === "visit"
        ? [prevEv.lat, prevEv.lon]
        : (drawnEnds.get(prevEv.data)?.end ?? [prevEv.end_lat, prevEv.end_lon]);
    const [toLat, toLon] =
      nextEv.type === "visit"
        ? [nextEv.lat, nextEv.lon]
        : (drawnEnds.get(nextEv.data)?.start ?? [nextEv.start_lat, nextEv.start_lon]);
    const gapM = haversineM(fromLat, fromLon, toLat, toLon);
    if (gapM < 15) continue;
    connectorCandidates.push({
      fromLat,
      fromLon,
      toLat,
      toLon,
      gapM,
      from_time: prevEv.end_time,
      to_time: nextEv.time,
      from_label:
        prevEv.type === "visit" ? prevEv.data.cluster : `${prevEv.data.mode} journey`,
      to_label:
        nextEv.type === "visit" ? nextEv.data.cluster : `${nextEv.data.mode} journey`,
    });
  }

  const connectors = [];
  const connectorTotal = connectorCandidates.length;
  let connectorDone = 0;
  for (const c of connectorCandidates) {
    connectorDone += 1;
    const pct =
      connectorTotal === 0
        ? 75
        : 50 + Math.round((connectorDone / connectorTotal) * 25);
    await report({
      stage: "Connecting places",
      detail: `${Math.round(c.gapM)}m gap (${connectorDone}/${connectorTotal})`,
      percent: pct,
      done: connectorDone,
      total: connectorTotal,
    });

    if (c.gapM < 300) {
      connectors.push({
        from_time: c.from_time,
        to_time: c.to_time,
        from_lat: c.fromLat,
        from_lon: c.fromLon,
        to_lat: c.toLat,
        to_lon: c.toLon,
        route_geometry: [
          [c.fromLat, c.fromLon],
          [c.toLat, c.toLon],
        ],
        steps: [],
        distance_meters: Math.round(c.gapM * 10) / 10,
        is_routed: false,
        from_label: c.from_label,
        to_label: c.to_label,
      });
    } else {
      const connectorData = await fetchRoute(
        db,
        c.fromLat,
        c.fromLon,
        c.toLat,
        c.toLon,
        connectorMode(c.gapM, c.from_time, c.to_time),
      );
      connectors.push({
        from_time: c.from_time,
        to_time: c.to_time,
        from_lat: c.fromLat,
        from_lon: c.fromLon,
        to_lat: c.toLat,
        to_lon: c.toLon,
        route_geometry: connectorData.geometry,
        steps: connectorData.steps,
        distance_meters: connectorData.steps.length
          ? connectorData.steps.reduce((s, st) => s + st.distance_meters, 0)
          : Math.round(c.gapM * 10) / 10,
        is_routed: true,
        from_label: c.from_label,
        to_label: c.to_label,
      });
    }
  }

  const visitEvents = events.filter((e) => e.type === "visit");
  const uniqueCoords = new Map<string, [number, number]>();
  for (const ev of visitEvents) {
    const key = `${Math.round(ev.data.lat * 1e5) / 1e5},${Math.round(ev.data.lon * 1e5) / 1e5}`;
    if (!uniqueCoords.has(key)) uniqueCoords.set(key, [ev.data.lat, ev.data.lon]);
  }

  await report({
    stage: "Resolving place names",
    detail: `${uniqueCoords.size} locations`,
    percent: 76,
    done: 0,
    total: uniqueCoords.size,
  });

  const placeNames = new Map<
    string,
    { name: string; address: string; data: Record<string, unknown>; short?: string }
  >();
  let placeDone = 0;
  const placeTotal = uniqueCoords.size;
  for (const [key, [lat, lon]] of uniqueCoords) {
    placeDone += 1;
    await report({
      stage: "Resolving place names",
      detail: `Lookup ${placeDone}/${placeTotal}`,
      percent: placeTotal === 0 ? 95 : 76 + Math.round((placeDone / placeTotal) * 19),
      done: placeDone,
      total: placeTotal,
    });

    const visit = visitEvents.find(
      (ev) =>
        Math.round(ev.data.lat * 1e5) / 1e5 === Math.round(lat * 1e5) / 1e5 &&
        Math.round(ev.data.lon * 1e5) / 1e5 === Math.round(lon * 1e5) / 1e5,
    );
    const landmark = tenant === "demo" ? landmarkForPlaceId(visit?.data.placeId) : null;
    if (landmark) {
      placeNames.set(key, {
        name: landmark.name,
        address: landmark.address,
        short: landmark.short_address,
        data: {
          address: {
            road: landmark.short_address,
            city: landmark.address.split(",").at(-1)?.trim() || "",
          },
        },
      });
    } else {
      placeNames.set(key, await resolveCoords(db, lat, lon));
    }
  }

  await report({ stage: "Assembling day view", percent: 97 });

  const enrichedVisits = [];
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx];
    if (ev.type !== "visit") continue;
    const v = ev.data;
    const vd = visitToApi(v) as Record<string, unknown>;

    let prevMode: string | null = null;
    for (let j = idx - 1; j >= 0; j--) {
      const prev = events[j];
      if (prev.type === "activity") {
        prevMode = prev.data.mode;
        break;
      }
    }
    vd.arrived_by = prevMode;

    let nextMode: string | null = null;
    for (let j = idx + 1; j < events.length; j++) {
      const next = events[j];
      if (next.type === "activity") {
        nextMode = next.data.mode;
        break;
      }
    }
    vd.departed_by = nextMode;

    const visitIdx = visitEvents.findIndex((e) => e === ev);
    vd.stop_number = visitIdx + 1;
    vd.total_stops = visitEvents.length;

    const coordKey = `${Math.round(v.lat * 1e5) / 1e5},${Math.round(v.lon * 1e5) / 1e5}`;
    const placeInfo = placeNames.get(coordKey) ?? { name: "", address: "", data: {} };
    vd.place_name = placeInfo.name;
    vd.place_address = placeInfo.address;
    if ("short" in placeInfo && placeInfo.short) {
      vd.place_short_address = placeInfo.short;
    } else {
      const addr = (placeInfo.data.address as Record<string, string>) ?? {};
      const parts: string[] = [];
      if (addr.road && addr.road !== placeInfo.name) parts.push(addr.road);
      const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
      if (suburb) parts.push(suburb);
      const city = addr.city || addr.town || addr.village || "";
      if (city) parts.push(city);
      vd.place_short_address = parts.join(", ");
    }
    enrichedVisits.push(vd);
  }

  const resolveName = (cluster: string | null | undefined, lat: number, lon: number) => {
    const key = `${Math.round(lat * 1e5) / 1e5},${Math.round(lon * 1e5) / 1e5}`;
    const info = placeNames.get(key);
    if (info?.name && info.name !== "Unknown") return info.name;
    return cluster ?? "";
  };

  for (const a of enrichedActivities) {
    for (const ev of visitEvents) {
      if (ev.data.cluster === a.from_place) {
        a.from_place = resolveName(ev.data.cluster, ev.data.lat, ev.data.lon) || a.from_place;
        break;
      }
    }
    for (const ev of visitEvents) {
      if (ev.data.cluster === a.to_place) {
        a.to_place = resolveName(ev.data.cluster, ev.data.lat, ev.data.lon) || a.to_place;
        break;
      }
    }
  }

  for (const c of connectors) {
    c.from_label = resolveName(c.from_label, c.from_lat, c.from_lon) || c.from_label;
    c.to_label = resolveName(c.to_label, c.to_lat, c.to_lon) || c.to_label;
  }

  await report({ stage: "Ready", percent: 100 });

  return {
    date,
    visits: enrichedVisits,
    activities: enrichedActivities,
    connectors,
    total_distance_miles: day.totalDistanceMiles,
    modes: day.modes,
    clusters: day.clusters,
  };
}

export async function getSourceById(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  sourceId: string,
) {
  const existing = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)))
    .limit(1);
  return existing[0] ?? null;
}

export async function listSources(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const sources = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.tenant, tenant));
  sources.sort(
    (a: { createdAt: Date }, b: { createdAt: Date }) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const result = [];
  for (const s of sources) {
    const [v] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(eq(visits.tenant, tenant), eq(visits.sourceId, s.id)));
    const [a] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(and(eq(activities.tenant, tenant), eq(activities.sourceId, s.id)));
    result.push({
      id: s.id,
      label: s.label,
      color: s.color ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      visitCount: v?.count ?? 0,
      activityCount: a?.count ?? 0,
    });
  }
  return result;
}

export async function renameSource(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  sourceId: string,
  label: string,
) {
  const trimmed = label.trim();
  if (!trimmed) return { error: "Label is required" as const };

  const existing = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)))
    .limit(1);
  if (!existing[0]) return { error: "Source not found" as const };

  try {
    await db
      .update(dataSources)
      .set({ label: trimmed, updatedAt: new Date() })
      .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return { error: "A source with that label already exists" as const };
    }
    throw err;
  }

  return { id: sourceId, label: trimmed };
}

export async function patchSource(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  sourceId: string,
  patch: { label?: string; color?: PlaceColorToken | null },
) {
  const existing = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)))
    .limit(1);
  if (!existing[0]) return { error: "Source not found" as const };

  const nextLabel = patch.label !== undefined ? patch.label.trim() : existing[0].label;
  if (!nextLabel) return { error: "Label is required" as const };

  try {
    await db
      .update(dataSources)
      .set({
        label: nextLabel,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return { error: "A source with that label already exists" as const };
    }
    throw err;
  }

  return {
    id: sourceId,
    label: nextLabel,
    color: patch.color !== undefined ? patch.color : existing[0].color ?? null,
  };
}

export async function removeSource(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  sourceId: string,
) {
  const existing = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)))
    .limit(1);
  if (!existing[0]) return { error: "Source not found" as const };
  await deleteSourceData(db, { tenant, sourceId });
  return { ok: true as const };
}

export async function getImportStatus(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
) {
  const [visitCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visits)
    .where(eq(visits.tenant, tenant));

  const jobs = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.tenant, tenant))
    .orderBy(desc(importJobs.createdAt))
    .limit(5);

  const sources = await listSources(db, tenant);

  const sample = await db
    .select({ start: visits.start, date: visits.date })
    .from(visits)
    .where(eq(visits.tenant, tenant))
    .limit(250);
  const settings = await getUserSettings(db, tenant);
  const timezoneWarning = timezoneSkewWarning(sample, settings.timezone);

  return {
    hasData: (visitCount?.count ?? 0) > 0,
    visitCount: visitCount?.count ?? 0,
    sourceCount: sources.length,
    sources,
    latestJob: jobs[0]
      ? {
          id: jobs[0].id,
          sourceId: jobs[0].sourceId,
          status: jobs[0].status,
          error: jobs[0].error,
          visitCount: jobs[0].visitCount,
          activityCount: jobs[0].activityCount,
          parsedCount: jobs[0].parsedCount,
          merge: jobs[0].merge,
          chosenFile: jobs[0].chosenFile,
          createdAt: jobs[0].createdAt,
          updatedAt: jobs[0].updatedAt,
        }
      : null,
    recentJobs: jobs.map((j) => ({
      id: j.id,
      sourceId: j.sourceId,
      status: j.status,
      error: j.error,
      visitCount: j.visitCount,
      activityCount: j.activityCount,
      parsedCount: j.parsedCount,
      merge: j.merge,
      chosenFile: j.chosenFile,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
    timezoneWarning,
  };
}

export async function createImportJob(
  db: ReturnType<typeof createDb>,
  opts: {
    id: string;
    tenant: TenantId;
    sourceId: string;
    userId: string;
    r2Key: string;
    status?: ImportJobStatus;
    merge?: boolean;
    chosenFile?: string | null;
  },
) {
  const now = new Date();
  await db.insert(importJobs).values({
    id: opts.id,
    tenant: opts.tenant,
    sourceId: opts.sourceId,
    userId: opts.userId,
    status: opts.status ?? "pending",
    merge: opts.merge ?? false,
    chosenFile: opts.chosenFile ?? null,
    r2Key: opts.r2Key,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getImportJob(
  db: ReturnType<typeof createDb>,
  jobId: string,
  tenant: TenantId,
) {
  const rows = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.tenant, tenant)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveImportJob(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db
    .select()
    .from(importJobs)
    .where(
      and(
        eq(importJobs.tenant, tenant),
        or(eq(importJobs.status, "pending"), eq(importJobs.status, "processing")),
      ),
    )
    .orderBy(desc(importJobs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateImportJob(
  db: ReturnType<typeof createDb>,
  jobId: string,
  patch: {
    status?: ImportJobStatus;
    error?: string | null;
    visitCount?: number;
    activityCount?: number;
    parsedCount?: number;
    notifiedAt?: Date;
  },
  tenant: TenantId,
) {
  await db
    .update(importJobs)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.status === "ready" || patch.status === "processing"
        ? { error: patch.error ?? null }
        : patch.error !== undefined
          ? { error: patch.error }
          : {}),
      ...(patch.visitCount !== undefined ? { visitCount: patch.visitCount } : {}),
      ...(patch.activityCount !== undefined ? { activityCount: patch.activityCount } : {}),
      ...(patch.parsedCount !== undefined ? { parsedCount: patch.parsedCount } : {}),
      ...(patch.notifiedAt !== undefined ? { notifiedAt: patch.notifiedAt } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(importJobs.id, jobId), eq(importJobs.tenant, tenant)));
}

export async function getAccountExportPayload(db: ReturnType<typeof createDb>, tenant: TenantId) {
  return {
    overview: await getOverview(db, tenant),
    sources: await listSources(db, tenant),
    settings: await getUserSettings(db, tenant),
    labels: await listPlaceLabels(db, tenant),
  };
}

const EXPORT_PAGE = 1000;

export async function listVisitExportPage(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  afterId: number,
) {
  return db
    .select()
    .from(visits)
    .where(and(eq(visits.tenant, tenant), gt(visits.id, afterId)))
    .orderBy(visits.id)
    .limit(EXPORT_PAGE);
}

export async function listActivityExportPage(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  afterId: number,
) {
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.tenant, tenant), gt(activities.id, afterId)))
    .orderBy(activities.id)
    .limit(EXPORT_PAGE);
}

export async function createExportJob(
  db: ReturnType<typeof createDb>,
  opts: {
    id: string;
    tenant: TenantId;
    userId: string;
    r2Key: string;
    status?: ExportJobStatus;
  },
) {
  const now = new Date();
  await db.insert(exportJobs).values({
    id: opts.id,
    tenant: opts.tenant,
    userId: opts.userId,
    status: opts.status ?? "pending",
    r2Key: opts.r2Key,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getExportJob(
  db: ReturnType<typeof createDb>,
  jobId: string,
  tenant: TenantId,
) {
  const rows = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.id, jobId), eq(exportJobs.tenant, tenant)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveExportJob(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.tenant, tenant))
    .orderBy(desc(exportJobs.createdAt))
    .limit(8);
  return rows.find((row) => row.status === "pending" || row.status === "processing") ?? null;
}

export async function updateExportJob(
  db: ReturnType<typeof createDb>,
  jobId: string,
  tenant: TenantId,
  patch: {
    status?: ExportJobStatus;
    error?: string | null;
    visitCount?: number;
    activityCount?: number;
    r2Key?: string | null;
  },
) {
  await db
    .update(exportJobs)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.visitCount !== undefined ? { visitCount: patch.visitCount } : {}),
      ...(patch.activityCount !== undefined ? { activityCount: patch.activityCount } : {}),
      ...(patch.r2Key !== undefined ? { r2Key: patch.r2Key } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(exportJobs.id, jobId), eq(exportJobs.tenant, tenant)));
}

export async function emailForTenant(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
): Promise<{ email: string; role: string } | null> {
  if (tenant === "demo") return null;
  const rows = await db
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, tenant))
    .limit(1);
  const row = rows[0];
  if (!row?.email) return null;
  return { email: row.email, role: row.role ?? "user" };
}

export { ensureDataSource, importSourceData };

export async function getSubscription(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.tenant, tenant)).limit(1);
  return rows[0] ?? null;
}

export async function getUserSettings(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db.select().from(userSettings).where(eq(userSettings.tenant, tenant)).limit(1);
  return (
    rows[0] ?? {
      tenant,
      distanceUnit: "mi" as DistanceUnit,
      timezone: null,
      monthlyRecapEnabled: false,
      monthlyRecapLastYm: null,
      mapBookmarks: [] as MapBookmark[],
      mapTileDarkUrl: null as string | null,
      mapTileLightUrl: null as string | null,
      updatedAt: new Date(),
    }
  );
}

export async function upsertUserSettings(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  patch: {
    distanceUnit?: DistanceUnit;
    timezone?: string | null;
    monthlyRecapEnabled?: boolean;
    monthlyRecapLastYm?: string | null;
    mapBookmarks?: MapBookmark[];
    mapTileDarkUrl?: string | null;
    mapTileLightUrl?: string | null;
  },
) {
  const current = await getUserSettings(db, tenant);
  const distanceUnit = patch.distanceUnit ?? current.distanceUnit ?? "mi";
  const timezone = patch.timezone === undefined ? current.timezone : patch.timezone;
  const monthlyRecapEnabled =
    patch.monthlyRecapEnabled === undefined
      ? (current.monthlyRecapEnabled ?? false)
      : patch.monthlyRecapEnabled;
  const monthlyRecapLastYm =
    patch.monthlyRecapLastYm === undefined
      ? (current.monthlyRecapLastYm ?? null)
      : patch.monthlyRecapLastYm;
  const mapBookmarks = patch.mapBookmarks ?? current.mapBookmarks ?? [];
  const mapTileDarkUrl =
    patch.mapTileDarkUrl === undefined
      ? (current.mapTileDarkUrl ?? null)
      : patch.mapTileDarkUrl?.trim() || null;
  const mapTileLightUrl =
    patch.mapTileLightUrl === undefined
      ? (current.mapTileLightUrl ?? null)
      : patch.mapTileLightUrl?.trim() || null;
  const timezoneChanged = patch.timezone !== undefined && patch.timezone !== current.timezone;
  await db
    .insert(userSettings)
    .values({
      tenant,
      distanceUnit,
      timezone,
      monthlyRecapEnabled,
      monthlyRecapLastYm,
      mapBookmarks,
      mapTileDarkUrl,
      mapTileLightUrl,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSettings.tenant,
      set: {
        distanceUnit,
        timezone,
        monthlyRecapEnabled,
        monthlyRecapLastYm,
        mapBookmarks,
        mapTileDarkUrl,
        mapTileLightUrl,
        updatedAt: new Date(),
      },
    });
  if (timezoneChanged) {
    await rebuildHourOfWeekCache(db, tenant, timezone);
  }
  return {
    tenant,
    distanceUnit,
    timezone,
    monthlyRecapEnabled,
    monthlyRecapLastYm,
    mapBookmarks,
    mapTileDarkUrl,
    mapTileLightUrl,
  };
}

export function filterHiddenSearchPlaces<T extends { cluster?: string | null }>(
  places: T[],
  hidden: Set<string>,
): T[] {
  if (!hidden.size) return places;
  return places.filter((p) => !p.cluster || !hidden.has(p.cluster));
}

export async function searchTenant(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  q: string,
) {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { places: [], days: [] };
  const like = `%${term}%`;
  const needle = term.toLowerCase();
  const hidden = await hiddenPlaceKeySet(db, tenant);
  const labels = await listPlaceLabels(db, tenant);
  const labelByKey = new Map(
    labels.filter((row) => !row.hidden).map((row) => [row.placeKey, row.label] as const),
  );
  const labelKeys = labels
    .filter((row) => {
      if (row.hidden) return false;
      if (row.label.toLowerCase().includes(needle)) return true;
      return (row.tags ?? []).some((tag) => tag.toLowerCase().includes(needle));
    })
    .map((row) => row.placeKey)
    .slice(0, 30);
  const clusterMatch = [ilike(visits.cluster, like), ilike(visits.semanticType, like)];
  if (labelKeys.length) clusterMatch.push(inArray(visits.cluster, labelKeys));
  const places = await db
    .select({
      cluster: visits.cluster,
      lat: visits.lat,
      lon: visits.lon,
      date: visits.date,
    })
    .from(visits)
    .where(and(eq(visits.tenant, tenant), or(...clusterMatch)))
    .orderBy(desc(visits.date))
    .limit(40);
  const unique: typeof places = [];
  const seen = new Set<string>();
  for (const row of places) {
    if (seen.has(row.cluster)) continue;
    seen.add(row.cluster);
    unique.push(row);
  }
  const visiblePlaces = filterHiddenSearchPlaces(unique, hidden).slice(0, 30);
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(term);
  const days = isoDay
    ? await db
        .select()
        .from(dayStats)
        .where(and(eq(dayStats.tenant, tenant), eq(dayStats.date, term)))
        .limit(5)
    : await db
        .select()
        .from(dayStats)
        .where(and(eq(dayStats.tenant, tenant), sql`${dayStats.date} like ${`%${term}%`}`))
        .limit(20);
  return {
    places: visiblePlaces.map((p) => ({
      ...p,
      label: (p.cluster && labelByKey.get(p.cluster)) || p.cluster,
    })),
    days,
  };
}

export async function upsertPlaceLabel(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  patch: {
    placeKey: string;
    label?: string;
    hidden?: boolean;
    favourite?: boolean;
    color?: PlaceColorToken | null;
    tags?: string[];
  },
) {
  const placeKey = patch.placeKey.slice(0, 200);
  const rows = await db
    .select()
    .from(placeLabels)
    .where(and(eq(placeLabels.tenant, tenant), eq(placeLabels.placeKey, placeKey)))
    .limit(1);
  const current = rows[0];
  const label =
    (patch.label !== undefined ? patch.label.trim() : current?.label)?.slice(0, 200) || placeKey;
  const hidden = patch.hidden ?? current?.hidden ?? false;
  const favourite = patch.favourite ?? current?.favourite ?? false;
  const color = patch.color !== undefined ? patch.color : (current?.color ?? null);
  const tags = patch.tags ?? current?.tags ?? [];
  const now = new Date();
  await db
    .insert(placeLabels)
    .values({ tenant, placeKey, label, hidden, favourite, color, tags, updatedAt: now })
    .onConflictDoUpdate({
      target: [placeLabels.tenant, placeLabels.placeKey],
      set: { label, hidden, favourite, color, tags, updatedAt: now },
    });
  return { placeKey, label, hidden, favourite, color, tags };
}

export async function listPlaceLabels(db: ReturnType<typeof createDb>, tenant: TenantId) {
  return db.select().from(placeLabels).where(eq(placeLabels.tenant, tenant));
}

export async function previewImport(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  opts: {
    records: unknown;
    sourceId?: string;
    timezone?: string | null;
    chosenPath?: string | null;
    candidates?: string[];
  },
) {
  const format = detectTimelineFormat(opts.records);
  const parsed = parseTimelineJson(opts.records);
  const incoming = datesFromParsed(parsed);
  const visitFilters = [eq(visits.tenant, tenant)];
  const activityFilters = [eq(activities.tenant, tenant)];
  if (opts.sourceId) {
    visitFilters.push(eq(visits.sourceId, opts.sourceId));
    activityFilters.push(eq(activities.sourceId, opts.sourceId));
  }
  const existingVisitDates = await db.select({ date: visits.date }).from(visits).where(and(...visitFilters));
  const existingActivityDates = await db
    .select({ date: activities.date })
    .from(activities)
    .where(and(...activityFilters));
  const existing = [...new Set([...existingVisitDates, ...existingActivityDates].map((r) => r.date))];
  const diff = importDayDiff(incoming, existing);
  const existSet = new Set(existing);
  const tz = timezoneSkewWarning(parsed.visits, opts.timezone);
  const existingVisitCount = existingVisitDates.length;
  return {
    chosenPath: opts.chosenPath ?? null,
    candidates: (opts.candidates ?? []).map((p) => p.replace(/\\/g, "/").split("/").pop() || p).slice(0, 20),
    format,
    visitCount: parsed.visits.length,
    activityCount: parsed.activities.length,
    dateMin: incoming[0] ?? null,
    dateMax: incoming[incoming.length - 1] ?? null,
    overlappingDays: diff.overlappingDays,
    newDays: diff.newDays,
    existingDays: diff.existingDays,
    overlappingSample: diff.overlappingSample,
    replaceWouldRemoveVisits: existingVisitCount,
    mergeWouldAppendVisits: parsed.visits.length,
    skipOverlapWouldAppendVisits: parsed.visits.filter((v) => !existSet.has(v.date)).length,
    timezoneWarning: tz,
  };
}

export async function deleteTenantDateRange(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  opts: { from: string; to: string; sourceId?: string },
) {
  if (opts.sourceId) {
    const existing = await getSourceById(db, tenant, opts.sourceId);
    if (!existing) return { error: "Source not found" as const };
  }
  return deleteDateRange(db, { tenant, ...opts });
}

/** Journeys per rewarm request; a GPS journey can take up to five OSRM calls. */
const REWARM_CAP = 8;

/**
 * Every journey's route_cache key, built the same way Day View routes it: GPS
 * journeys use trace keys, the rest endpoint keys. Shared by progress and rewarm
 * so the two always agree.
 */
async function loadRouteCandidates(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db
    .select({
      start: activities.start,
      end: activities.end,
      startLat: activities.startLat,
      startLon: activities.startLon,
      endLat: activities.endLat,
      endLon: activities.endLon,
      mode: activities.mode,
      distanceMeters: activities.distanceMeters,
      path: activities.path,
    })
    .from(activities)
    .where(eq(activities.tenant, tenant));

  // Without neighbouring stops this cannot apply journeyAnchor, so the few journeys
  // whose recorded endpoint gets replaced in Day View are routed on first view instead.
  const candidates: Array<(typeof rows)[number] & { key: string; trace: PathPoint[] | null }> = [];
  for (const a of rows) {
    const trace = journeyTrace(a);
    if (trace && trace.length >= 3) {
      if (RAW_TRACE_MODES.has(a.mode)) continue;
      candidates.push({ ...a, trace, key: traceRouteCacheKey(trace, a.mode) });
      continue;
    }
    if (SKIP.has(a.mode)) continue;
    const profile = MODE_TO_PROFILE[a.mode] ?? "driving";
    candidates.push({
      ...a,
      trace: null,
      key: makeRouteCacheKey(a.startLat, a.startLon, a.endLat, a.endLon, profile),
    });
  }

  const cachedKeys = new Set<string>();
  const keys = [...new Set(candidates.map((c) => c.key))];
  for (let i = 0; i < keys.length; i += 400) {
    const batch = keys.slice(i, i + 400);
    const found = await db
      .select({ key: routeCache.key })
      .from(routeCache)
      .where(inArray(routeCache.key, batch));
    for (const row of found) cachedKeys.add(row.key);
  }
  return { candidates, cachedKeys };
}

export async function rewarmRoutes(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
) {
  const { candidates, cachedKeys } = await loadRouteCandidates(db, tenant);
  const seen = new Set<string>();
  const uncached = candidates.filter((c) => {
    if (cachedKeys.has(c.key) || seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
  const batch = uncached.slice(0, REWARM_CAP);
  for (const a of batch) {
    if (a.trace) await fetchTraceRoute(db, a.trace, a.mode, a.distanceMeters);
    else await fetchRoute(db, a.startLat, a.startLon, a.endLat, a.endLon, a.mode);
  }
  return {
    warmed: batch.length,
    remaining: uncached.length - batch.length,
    cap: REWARM_CAP,
  };
}

async function hiddenPlaceKeySet(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
): Promise<Set<string>> {
  const rows = await listPlaceLabels(db, tenant);
  return new Set(rows.filter((r) => r.hidden).map((r) => r.placeKey));
}

export async function wipeTenantData(
  db: ReturnType<typeof createDb>,
  tenant: TenantId,
  userId: string,
  email?: string,
) {
  await db.delete(visits).where(eq(visits.tenant, tenant));
  await db.delete(activities).where(eq(activities.tenant, tenant));
  await db.delete(dayStats).where(eq(dayStats.tenant, tenant));
  await db.delete(analyticsCache).where(eq(analyticsCache.tenant, tenant));
  await db.delete(importJobs).where(eq(importJobs.tenant, tenant));
  await db.delete(exportJobs).where(eq(exportJobs.tenant, tenant));
  await db.delete(dataSources).where(eq(dataSources.tenant, tenant));
  await db.delete(placeLabels).where(eq(placeLabels.tenant, tenant));
  await db.delete(namedTrips).where(eq(namedTrips.tenant, tenant));
  await db.delete(lifeChapters).where(eq(lifeChapters.tenant, tenant));
  await db.delete(userSettings).where(eq(userSettings.tenant, tenant));
  await db.delete(subscriptions).where(eq(subscriptions.tenant, tenant));
  if (email) {
    await db.delete(verification).where(eq(verification.identifier, email));
  }
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
}

void METERS_TO_MILES;

export {
  listClusters,
  getCluster,
  listClusterVisits,
  getCorridorDetail,
  getTripRange,
  getRouteLines,
  getHotspotDays,
  listNamedTrips,
  upsertNamedTrip,
  deleteNamedTrip,
  listChapters,
  upsertChapter,
  deleteChapter,
  listImportJobs,
  staffTenantStats,
} from "./catalog";

import { and, eq, sql, desc } from "drizzle-orm";
import {
  createDb,
  activities,
  analyticsCache,
  dayStats,
  visits,
  routeCache,
  placeCache,
  makeRouteCacheKey,
  makeCoordPlaceKey,
  makeRailArc,
  snapGeometry,
  haversineM,
  METERS_TO_MILES,
  type RouteStep,
  type ActivityRow,
  type VisitRow,
  type TenantId,
  landmarkForPlaceId,
} from "@locations/db";
import type { Env } from "./env";

const OSRM_BASE = "https://router.project-osrm.org/route/v1";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

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
    const resp = await fetch(url);
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
      headers: { "User-Agent": "LocationExplorer/1.0 (portfolio; contact via aden.website)" },
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

function visitToApi(v: VisitRow) {
  return {
    start: v.start,
    end: v.end,
    lat: v.lat,
    lon: v.lon,
    cluster: v.cluster,
    semantic_type: v.semanticType,
    place_id: v.placeId,
    duration_minutes: v.durationMinutes,
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
    .select({ date: dayStats.date })
    .from(dayStats)
    .where(eq(dayStats.tenant, tenant))
    .orderBy(dayStats.date);
  return rows.map((r) => r.date);
}

export async function getHeatmap(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const rows = await db
    .select({ lat: visits.lat, lon: visits.lon })
    .from(visits)
    .where(eq(visits.tenant, tenant));
  const counts = new Map<string, { lat: number; lon: number; count: number }>();
  for (const r of rows) {
    const lat = Math.round(r.lat * 1e5) / 1e5;
    const lon = Math.round(r.lon * 1e5) / 1e5;
    const key = `${lat},${lon}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { lat, lon, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
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
  return rows[0]?.data ?? [];
}

export async function getRouteProgress(db: ReturnType<typeof createDb>, tenant: TenantId) {
  const [activityCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(eq(activities.tenant, tenant));
  const [cachedCount] = await db.select({ count: sql<number>`count(*)::int` }).from(routeCache);
  const total = activityCount?.count ?? 0;
  const cached = cachedCount?.count ?? 0;
  return {
    running: false,
    total,
    cached,
    errors: 0,
    percent: Math.round((cached / Math.max(total, 1)) * 1000) / 10,
  };
}

export async function getDay(db: ReturnType<typeof createDb>, tenant: TenantId, date: string) {
  const dayRows = await db
    .select()
    .from(dayStats)
    .where(and(eq(dayStats.tenant, tenant), eq(dayStats.date, date)))
    .limit(1);
  const day = dayRows[0];
  if (!day) return { error: "No data for this date" };

  const dayVisits = await db
    .select()
    .from(visits)
    .where(and(eq(visits.tenant, tenant), eq(visits.date, date)))
    .orderBy(visits.start);
  const dayActivities = await db
    .select()
    .from(activities)
    .where(and(eq(activities.tenant, tenant), eq(activities.date, date)))
    .orderBy(activities.start);

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
    events.push({
      time: v.start,
      end_time: v.end,
      type: "visit",
      lat: v.lat,
      lon: v.lon,
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

  const enrichedActivities = [];
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx];
    if (ev.type !== "activity") continue;
    const a = ev.data;
    const routeData = await fetchRoute(db, a.startLat, a.startLon, a.endLat, a.endLon, a.mode);
    const d = activityToApi(a) as Record<string, unknown>;

    let snapStartLat = a.startLat;
    let snapStartLon = a.startLon;
    for (let j = idx - 1; j >= 0; j--) {
      if (events[j].type === "visit") {
        snapStartLat = events[j].lat;
        snapStartLon = events[j].lon;
        break;
      }
    }
    let snapEndLat = a.endLat;
    let snapEndLon = a.endLon;
    for (let j = idx + 1; j < events.length; j++) {
      if (events[j].type === "visit") {
        snapEndLat = events[j].lat;
        snapEndLon = events[j].lon;
        break;
      }
    }

    if (a.mode === "train" || a.mode === "subway") {
      d.route_geometry = makeRailArc(snapStartLat, snapStartLon, snapEndLat, snapEndLon);
      d.steps = [];
      d.has_osrm_route = false;
      d.is_rail = true;
    } else {
      d.route_geometry = snapGeometry(
        routeData.geometry,
        snapStartLat,
        snapStartLon,
        snapEndLat,
        snapEndLon,
      );
      d.steps = routeData.steps;
      d.has_osrm_route = routeData.steps.length > 0;
      d.is_rail = false;
    }

    let fromPlace: string | null = null;
    for (let j = idx - 1; j >= 0; j--) {
      if (events[j].type === "visit") {
        fromPlace = events[j].data.cluster;
        break;
      }
    }
    let toPlace: string | null = null;
    for (let j = idx + 1; j < events.length; j++) {
      if (events[j].type === "visit") {
        toPlace = events[j].data.cluster;
        break;
      }
    }
    d.from_place = fromPlace;
    d.to_place = toPlace;
    enrichedActivities.push(d);
  }

  const connectors = [];
  for (let i = 0; i < events.length - 1; i++) {
    const prevEv = events[i];
    const nextEv = events[i + 1];
    const fromLat = prevEv.type === "visit" ? prevEv.lat : prevEv.end_lat;
    const fromLon = prevEv.type === "visit" ? prevEv.lon : prevEv.end_lon;
    const toLat = nextEv.type === "visit" ? nextEv.lat : nextEv.start_lat;
    const toLon = nextEv.type === "visit" ? nextEv.lon : nextEv.start_lon;
    const gapM = haversineM(fromLat, fromLon, toLat, toLon);
    if (gapM < 15) continue;

    const fromLabel =
      prevEv.type === "visit" ? prevEv.data.cluster : `${prevEv.data.mode} journey`;
    const toLabel =
      nextEv.type === "visit" ? nextEv.data.cluster : `${nextEv.data.mode} journey`;

    if (gapM < 300) {
      connectors.push({
        from_time: prevEv.end_time,
        to_time: nextEv.time,
        from_lat: fromLat,
        from_lon: fromLon,
        to_lat: toLat,
        to_lon: toLon,
        route_geometry: [
          [fromLat, fromLon],
          [toLat, toLon],
        ],
        steps: [],
        distance_meters: Math.round(gapM * 10) / 10,
        is_routed: false,
        from_label: fromLabel,
        to_label: toLabel,
      });
    } else {
      const connectorData = await fetchRoute(db, fromLat, fromLon, toLat, toLon, "car");
      connectors.push({
        from_time: prevEv.end_time,
        to_time: nextEv.time,
        from_lat: fromLat,
        from_lon: fromLon,
        to_lat: toLat,
        to_lon: toLon,
        route_geometry: connectorData.geometry,
        steps: connectorData.steps,
        distance_meters: connectorData.steps.length
          ? connectorData.steps.reduce((s, st) => s + st.distance_meters, 0)
          : Math.round(gapM * 10) / 10,
        is_routed: true,
        from_label: fromLabel,
        to_label: toLabel,
      });
    }
  }

  const visitEvents = events.filter((e) => e.type === "visit");
  const uniqueCoords = new Map<string, [number, number]>();
  for (const ev of visitEvents) {
    const key = `${Math.round(ev.data.lat * 1e5) / 1e5},${Math.round(ev.data.lon * 1e5) / 1e5}`;
    if (!uniqueCoords.has(key)) uniqueCoords.set(key, [ev.data.lat, ev.data.lon]);
  }

  const placeNames = new Map<
    string,
    { name: string; address: string; data: Record<string, unknown>; short?: string }
  >();
  for (const [key, [lat, lon]] of uniqueCoords) {
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

  const enrichedVisits = [];
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx];
    if (ev.type !== "visit") continue;
    const v = ev.data;
    const vd = visitToApi(v) as Record<string, unknown>;

    let prevMode: string | null = null;
    for (let j = idx - 1; j >= 0; j--) {
      if (events[j].type === "activity") {
        prevMode = events[j].data.mode;
        break;
      }
    }
    vd.arrived_by = prevMode;

    let nextMode: string | null = null;
    for (let j = idx + 1; j < events.length; j++) {
      if (events[j].type === "activity") {
        nextMode = events[j].data.mode;
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
    if (a.from_place) {
      // try to improve from previous visit coords already in placeNames
    }
    // Use place names when coords match
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

// silence unused import warning for desc if any
void desc;
void METERS_TO_MILES;

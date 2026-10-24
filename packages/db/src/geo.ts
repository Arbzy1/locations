import type { PathPoint } from "./schema.js";

export const METERS_TO_MILES = 0.000621371;

export const TRANSPORT_MODE_MAP: Record<string, string> = {
  walking: "walking",
  "in passenger vehicle": "car",
  "in bus": "bus",
  "in train": "train",
  cycling: "cycling",
  "in subway": "subway",
  flying: "flying",
  motorcycling: "car",
  "in tram": "train",
  unknown: "unknown",
};

/** Kept for tests; clustering is grid-based, not a hardcoded gazetteer. */
export const CLUSTERS: Array<[number, number, number, string]> = [];

/** Grid cell (~0.5°) so labels are data-driven, not UK-hardcoded. */
export function classifyLocation(lat: number, lon: number): string {
  const glat = Math.round(lat * 2) / 2;
  const glon = Math.round(lon * 2) / 2;
  const latHem = glat >= 0 ? "N" : "S";
  const lonHem = glon >= 0 ? "E" : "W";
  return `${Math.abs(glat).toFixed(1)}°${latHem} ${Math.abs(glon).toFixed(1)}°${lonHem}`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

export function parseGeo(geoStr: string | undefined | null): [number, number] | null {
  if (!geoStr || !geoStr.startsWith("geo:")) return null;
  const parts = geoStr.slice(4).split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return [lat, lon];
}

export function mapTransportMode(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/_/g, " ");
  return TRANSPORT_MODE_MAP[key] ?? "unknown";
}

export function makeRouteCacheKey(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  profile: string,
): string {
  return `${startLat.toFixed(6)},${startLon.toFixed(6)},${endLat.toFixed(6)},${endLon.toFixed(6)},${profile}`;
}

/** A stay's real-place key: Google's placeId, else its position snapped to ~100 m. */
export function visitPlaceKey(placeId: string | null | undefined, lat: number, lon: number): string {
  if (placeId) return `g:${placeId}`;
  return `c:${lat.toFixed(3)},${lon.toFixed(3)}`;
}

export function makeCoordPlaceKey(lat: number, lon: number): string {
  return `coord:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function makeRailArc(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numPoints = 30,
): [number, number][] {
  const distM = haversineM(startLat, startLon, endLat, endLon);
  if (distM < 2000) return [[startLat, startLon], [endLat, endLon]];

  const bow = Math.min(distM / 200000, 0.15);
  const points: [number, number][] = [];
  const dx = endLon - startLon;
  const dy = endLat - startLat;
  const length = Math.sqrt(dx ** 2 + dy ** 2);

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    let lat = startLat + t * (endLat - startLat);
    let lon = startLon + t * (endLon - startLon);
    const offset = bow * Math.sin(t * Math.PI);
    if (length > 0) {
      lat += offset * (-dx / length);
      lon += offset * (dy / length);
    }
    points.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6]);
  }
  return points;
}

export function snapGeometry(
  geometry: [number, number][],
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): [number, number][] {
  if (!geometry.length) return [[startLat, startLon], [endLat, endLon]];
  const result = [...geometry];
  if (result[0][0] !== startLat || result[0][1] !== startLon) {
    result.unshift([startLat, startLon]);
  }
  const last = result[result.length - 1];
  if (last[0] !== endLat || last[1] !== endLon) {
    result.push([endLat, endLon]);
  }
  return result;
}

/**
 * Journey trace in time order: start point, recorded GPS fixes, end point.
 * Null when the journey has no recorded fixes to follow.
 */
export function journeyTrace(a: {
  start: string;
  end: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  path?: PathPoint[] | null;
}): PathPoint[] | null {
  const inner = (a.path ?? []).filter(
    (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]),
  );
  if (!inner.length) return null;
  const startS = Math.round(Date.parse(a.start) / 1000);
  const endS = Math.round(Date.parse(a.end) / 1000);
  const firstFix = inner[0];
  const lastFix = inner[inner.length - 1];
  const head: PathPoint = [a.startLat, a.startLon, Number.isFinite(startS) ? Math.min(startS, firstFix[2]) : firstFix[2]];
  const tail: PathPoint = [a.endLat, a.endLon, Number.isFinite(endS) ? Math.max(endS, lastFix[2]) : lastFix[2]];
  // Google's start or end is sometimes the wrong place entirely (seen: a "0.1 km walk"
  // whose start was its destination, 40 km from its first fix at the same moment).
  // Such an end point would draw the journey there and back; leave it out.
  return [
    ...(reachable(head, firstFix) ? [head] : []),
    ...inner,
    ...(reachable(lastFix, tail) ? [tail] : []),
  ];
}

/** Whether one could get from `a` to `b` in the time between them (under 250 km/h, 1 min slack). */
function reachable(a: PathPoint, b: PathPoint): boolean {
  const m = haversineM(a[0], a[1], b[0], b[1]);
  return m <= 1000 || (m / Math.max(Math.abs(b[2] - a[2]), 60)) * 3.6 <= 250;
}

/**
 * Drop fixes closer than `minSpacingM` to the previous kept one (GPS jitter while
 * stopped at lights etc.), then sample down to `maxPoints`. Keeps both ends.
 */
export function thinTrace(
  trace: PathPoint[],
  opts: { minSpacingM: number; maxPoints: number },
): PathPoint[] {
  if (trace.length <= 2) return trace;
  const end = trace[trace.length - 1];
  const kept: PathPoint[] = [trace[0]];
  for (let i = 1; i < trace.length - 1; i++) {
    const prev = kept[kept.length - 1];
    if (haversineM(prev[0], prev[1], trace[i][0], trace[i][1]) >= opts.minSpacingM) {
      kept.push(trace[i]);
    }
  }
  const prev = kept[kept.length - 1];
  if (kept.length > 1 && haversineM(prev[0], prev[1], end[0], end[1]) < opts.minSpacingM) {
    kept.pop();
  }
  kept.push(end);
  if (kept.length <= opts.maxPoints) return kept;
  const step = (kept.length - 1) / (opts.maxPoints - 1);
  return Array.from({ length: opts.maxPoints }, (_, k) => kept[Math.round(k * step)]);
}

/** Length of a `[lat, lon, ...]` polyline in metres. */
export function polylineLengthM(points: ReadonlyArray<readonly [number, number, ...number[]]>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineM(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return total;
}

function fnv1a(input: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Shared route_cache key for a GPS-guided route. Hashed so the cache row does not
 * spell out the trace coordinates.
 */
export function makeTraceCacheKey(trace: PathPoint[], profile: string): string {
  const body = trace.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");
  return `trace:${profile}:${trace.length}:${fnv1a(body, 0x811c9dc5)}${fnv1a(body, 0x9747b28c)}`;
}

type LatLonLike = readonly [number, number, ...number[]];

/** Distance in metres from a point to a polyline (local equirectangular projection). */
export function distanceToPolylineM(lat: number, lon: number, line: ReadonlyArray<LatLonLike>): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return haversineM(lat, lon, line[0][0], line[0][1]);
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][1] - lon) * kx;
    const ay = (line[i - 1][0] - lat) * ky;
    const bx = (line[i][1] - lon) * kx;
    const by = (line[i][0] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.sqrt(px * px + py * py));
  }
  return best;
}

/** How far a drawn line strays from recorded fixes. */
export function traceDeviation(
  fixes: ReadonlyArray<LatLonLike>,
  line: ReadonlyArray<LatLonLike>,
): { medianM: number; maxM: number; within100Pct: number } | null {
  if (!fixes.length || line.length < 2) return null;
  const d = fixes.map((f) => distanceToPolylineM(f[0], f[1], line)).sort((a, b) => a - b);
  return {
    medianM: Math.round(d[Math.floor((d.length - 1) / 2)]),
    maxM: Math.round(d[d.length - 1]),
    within100Pct: Math.round((d.filter((x) => x <= 100).length / d.length) * 100),
  };
}

/** Points every `everyM` metres along a trace (excluding the ends), at most `max`. */
export function sampleAlongTrace(
  trace: ReadonlyArray<LatLonLike>,
  everyM: number,
  max: number,
): [number, number][] {
  const total = polylineLengthM(trace);
  if (trace.length < 2 || total < everyM) return [];
  const count = Math.min(max, Math.floor(total / everyM));
  const step = total / (count + 1);
  const out: [number, number][] = [];
  let walked = 0;
  let target = step;
  for (let i = 1; i < trace.length && out.length < count; i++) {
    const seg = haversineM(trace[i - 1][0], trace[i - 1][1], trace[i][0], trace[i][1]);
    while (seg > 0 && walked + seg >= target && out.length < count) {
      const t = (target - walked) / seg;
      out.push([
        trace[i - 1][0] + (trace[i][0] - trace[i - 1][0]) * t,
        trace[i - 1][1] + (trace[i][1] - trace[i - 1][1]) * t,
      ]);
      target += step;
    }
    walked += seg;
  }
  return out;
}

export type JourneyAccuracy = {
  score: "high" | "medium" | "low";
  fixes: number;
  maxGapMin: number;
  meanOffsetM: number | null;
};

/**
 * How much to trust a drawn journey: GPS fix count, the longest stretch without
 * a fix, and how far the fixes sit from the line actually drawn.
 */
export function journeyAccuracy(opts: {
  path: PathPoint[] | null | undefined;
  startS: number;
  endS: number;
  drawnLine: ReadonlyArray<LatLonLike>;
}): JourneyAccuracy {
  const fixes = opts.path ?? [];
  if (!fixes.length) return { score: "low", fixes: 0, maxGapMin: Math.round((opts.endS - opts.startS) / 60), meanOffsetM: null };
  const times = [opts.startS, ...fixes.map((f) => f[2]), opts.endS].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, times[i] - times[i - 1]);
  const maxGapMin = Math.round(maxGap / 60);
  const offsets = opts.drawnLine.length >= 2 ? fixes.map((f) => distanceToPolylineM(f[0], f[1], opts.drawnLine)) : [];
  const meanOffsetM = offsets.length ? Math.round(offsets.reduce((s, x) => s + x, 0) / offsets.length) : null;
  const offset = meanOffsetM ?? 0;
  const score =
    fixes.length >= 3 && maxGapMin <= 5 && offset <= 60
      ? "high"
      : maxGapMin > 15 || offset > 250
        ? "low"
        : "medium";
  return { score, fixes: fixes.length, maxGapMin, meanOffsetM };
}

import { haversineM, journeyTrace, polylineLengthM, thinTrace } from "./geo.js";
import type { PathPoint } from "./schema.js";

/**
 * Train detection and rail-snapped lines from GPS fixes. Pure and browser-safe: the
 * web app runs it in the import worker, the CLI with a disk loader. Rail lines come
 * from static OpenStreetMap tiles under /assets/rail (see scripts/rail).
 */

export type RailKind = "rail" | "subway" | "tram";
export type RailTile = {
  v: 1;
  lines: { k: RailKind; c: [number, number][] }[];
  stations: [number, number][];
};
/** `index.json` next to the tiles. A tile inside `bbox` but not in `tiles` has no rail. */
export type RailCoverage = {
  v: 1;
  z: number;
  built: string;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  tiles: string[];
};

/** Bump when detection rules change so stored results are recomputed. */
export const MODE_DETECTOR_VERSION = 1;
/**
 * A fix this close to a rail line counts as on the tracks. Phone GPS on trains is rough:
 * on the user's real export only about half of train fixes fell within 40 m, most within 80 m.
 */
const ON_RAIL_M = 80;
/** Fixes implying more than this from both neighbours are GPS spikes. */
const SPIKE_KMH = 350;
const SNAP_M = 60;
const MAX_RAIL_GEOMETRY_POINTS = 300;

const LAT_STEP = 0.002; // ~220 m
const LON_STEP = 0.003; // ~200 m at UK latitudes
const SAMPLE_M = 50;

export function railTileKey(lat: number, lon: number, z: number): string {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return `${x}/${y}`;
}

export function railCovers(coverage: RailCoverage, lat: number, lon: number): boolean {
  const [minLon, minLat, maxLon, maxLat] = coverage.bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

type Seg = { aLat: number; aLon: number; bLat: number; bLon: number; kind: RailKind };
type Hit = { distM: number; seg: number; t: number; lat: number; lon: number };

const bucketKey = (lat: number, lon: number) => `${Math.floor(lat / LAT_STEP)},${Math.floor(lon / LON_STEP)}`;

/** Distance from a point to a segment, with the projection (local equirectangular). */
function toSegment(lat: number, lon: number, s: Seg): { d: number; t: number } {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  const ax = (s.aLon - lon) * kx;
  const ay = (s.aLat - lat) * ky;
  const dx = (s.bLon - s.aLon) * kx;
  const dy = (s.bLat - s.aLat) * ky;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return { d: Math.sqrt(px * px + py * py), t };
}

/** Grid index over rail segments, so nearest-rail lookups stay local. */
export class RailIndex {
  readonly segs: Seg[] = [];
  private readonly buckets = new Map<string, number[]>();

  readonly coverage: RailCoverage | null;

  constructor(tiles: Iterable<RailTile>, coverage: RailCoverage | null = null) {
    this.coverage = coverage;
    for (const tile of tiles) {
      for (const line of tile.lines) {
        for (let i = 1; i < line.c.length; i++) {
          const [aLat, aLon] = line.c[i - 1];
          const [bLat, bLon] = line.c[i];
          const id = this.segs.push({ aLat, aLon, bLat, bLon, kind: line.k }) - 1;
          // Sample every 50 m so any point within ~80 m of the segment shares a bucket
          // with a sample or sits next to one.
          const steps = Math.max(1, Math.ceil(haversineM(aLat, aLon, bLat, bLon) / SAMPLE_M));
          let last = "";
          for (let k = 0; k <= steps; k++) {
            const key = bucketKey(aLat + ((bLat - aLat) * k) / steps, aLon + ((bLon - aLon) * k) / steps);
            if (key === last) continue;
            last = key;
            const list = this.buckets.get(key);
            if (list) {
              if (list[list.length - 1] !== id) list.push(id);
            } else this.buckets.set(key, [id]);
          }
        }
      }
    }
  }

  covers(lat: number, lon: number): boolean {
    return this.coverage ? railCovers(this.coverage, lat, lon) : true;
  }

  /** Segment ids in the buckets around a point (radius in buckets). */
  segmentsNear(lat: number, lon: number, radius = 1): number[] {
    const bi = Math.floor(lat / LAT_STEP);
    const bj = Math.floor(lon / LON_STEP);
    const out = new Set<number>();
    for (let i = bi - radius; i <= bi + radius; i++) {
      for (let j = bj - radius; j <= bj + radius; j++) {
        for (const id of this.buckets.get(`${i},${j}`) ?? []) out.add(id);
      }
    }
    return [...out];
  }

  nearest(lat: number, lon: number, maxM: number, skip?: (seg: number) => boolean): Hit | null {
    let best: Hit | null = null;
    for (const id of this.segmentsNear(lat, lon)) {
      if (skip?.(id)) continue;
      const s = this.segs[id];
      const { d, t } = toSegment(lat, lon, s);
      if (d <= maxM && (!best || d < best.distM)) {
        best = { distM: d, seg: id, t, lat: s.aLat + (s.bLat - s.aLat) * t, lon: s.aLon + (s.bLon - s.aLon) * t };
      }
    }
    return best;
  }
}

/** The tiles a set of points needs (tiles carry ~100 m overlap, so a point's own tile is enough). */
export function railTilesFor(coverage: RailCoverage, points: Iterable<readonly [number, number, ...number[]]>): string[] {
  const have = new Set(coverage.tiles);
  const out = new Set<string>();
  for (const p of points) {
    if (!railCovers(coverage, p[0], p[1])) continue;
    const key = railTileKey(p[0], p[1], coverage.z);
    if (have.has(key)) out.add(key);
  }
  return [...out];
}

/** Load just the tiles these points touch and index them. */
export async function loadRailIndex(
  coverage: RailCoverage,
  points: Iterable<readonly [number, number, ...number[]]>,
  getTile: (key: string) => Promise<RailTile | null>,
): Promise<RailIndex> {
  const keys = railTilesFor(coverage, points);
  const tiles: RailTile[] = [];
  // A few at a time: the browser serves these from /assets, the CLI from disk.
  for (let i = 0; i < keys.length; i += 8) {
    const batch = await Promise.all(keys.slice(i, i + 8).map((k) => getTile(k).catch(() => null)));
    for (const t of batch) if (t && t.v === 1) tiles.push(t);
  }
  return new RailIndex(tiles, coverage);
}

/**
 * Drop GPS spikes: a fix that implies more than 350 km/h from both neighbours when
 * skipping it does not, or an out-and-back jump of over 1 km. Keeps both ends.
 */
export function cleanTrace(trace: PathPoint[]): PathPoint[] {
  if (trace.length <= 2) return trace;
  const kmh = (a: PathPoint, b: PathPoint) => {
    const m = haversineM(a[0], a[1], b[0], b[1]);
    const s = Math.abs(b[2] - a[2]);
    return s > 0 ? (m / s) * 3.6 : m > 50 ? Infinity : 0;
  };
  const kept: PathPoint[] = [trace[0]];
  for (let i = 1; i < trace.length - 1; i++) {
    const prev = kept[kept.length - 1];
    const cur = trace[i];
    const next = trace[i + 1];
    const out = haversineM(prev[0], prev[1], cur[0], cur[1]);
    const back = haversineM(cur[0], cur[1], next[0], next[1]);
    const direct = haversineM(prev[0], prev[1], next[0], next[1]);
    // Real flights are fast between every fix; a spike is fast only through this one.
    const spike = kmh(prev, cur) > SPIKE_KMH && kmh(cur, next) > SPIKE_KMH && kmh(prev, next) <= SPIKE_KMH;
    const zigzag = out > 1000 && back > 1000 && direct < 0.3 * Math.min(out, back);
    if (!spike && !zigzag) kept.push(cur);
  }
  kept.push(trace[trace.length - 1]);
  return kept;
}

export type ModeDetection = {
  mode: string;
  /** high: relabel the journey. medium: only suggest it. */
  confidence: "high" | "medium";
  by: "rail" | "speed";
  railPct: number | null;
  /** Average speed over the whole journey. */
  avgKmh: number;
  v: number;
};

export type DetectableJourney = {
  mode: string;
  start: string;
  end: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distanceMeters: number;
  path?: PathPoint[] | null;
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Speeds between consecutive trace points in km/h (pairs with no time step skipped). */
function segmentSpeeds(trace: PathPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < trace.length; i++) {
    const s = trace[i][2] - trace[i - 1][2];
    if (s > 0) out.push((haversineM(trace[i - 1][0], trace[i - 1][1], trace[i][0], trace[i][1]) / s) * 3.6);
  }
  return out;
}

const RAIL_CANDIDATES = new Set(["car", "bus", "unknown"]);

/**
 * What the GPS fixes say the journey really was, or null when they agree with Google
 * (or are too thin to say). Rail first: most fixes on a railway at train speeds.
 * Then speed sanity for walking / driving / flying labels.
 */
export function detectJourneyMode(a: DetectableJourney, rail: RailIndex | null): ModeDetection | null {
  const raw = journeyTrace(a);
  if (!raw || raw.length < 3) return null;
  const trace = cleanTrace(raw);
  const fixes = trace.slice(1, -1);
  const lengthM = Math.max(polylineLengthM(trace), a.distanceMeters || 0);
  const hours = (Date.parse(a.end) - Date.parse(a.start)) / 3_600_000;
  if (!(hours > 0)) return null;
  const avgKmh = Math.round((lengthM / 1000 / hours) * 10) / 10;
  const base = { avgKmh, v: MODE_DETECTOR_VERSION };

  // Thresholds tuned on a real export (London area): with 75% of fixes within 80 m of a
  // railway, a median distance of 50 m or less and over 20 km/h, 50 of 69 Google-labelled
  // trains matched against 4 of 1,425 cars and 5 of 264 buses (likely mislabelled trains).
  if (rail && RAIL_CANDIDATES.has(a.mode) && fixes.length >= 4 && lengthM >= 3000) {
    const covered = fixes.filter((f) => rail.covers(f[0], f[1])).length;
    if (covered >= fixes.length * 0.9) {
      const kinds: Record<RailKind, number> = { rail: 0, subway: 0, tram: 0 };
      const dists: number[] = [];
      for (const f of fixes) {
        // Trams share streets with cars and buses, so tram track alone proves nothing.
        const hit = rail.nearest(f[0], f[1], 300, (seg) => rail.segs[seg].kind === "tram");
        dists.push(hit ? hit.distM : 300);
        if (hit && hit.distM <= ON_RAIL_M) kinds[rail.segs[hit.seg].kind] += 1;
      }
      const on = kinds.rail + kinds.subway;
      const railPct = Math.round((on / fixes.length) * 100);
      const medianM = median(dists);
      const mode = kinds.subway > kinds.rail ? "subway" : "train";
      if (railPct >= 75 && medianM <= 50 && avgKmh > 20) {
        return { mode, confidence: "high", by: "rail", railPct, ...base };
      }
      if (railPct >= 60 && medianM <= 80 && avgKmh > 15) {
        return { mode, confidence: "medium", by: "rail", railPct, ...base };
      }
    }
  }

  // Speed sanity needs a few real speed samples to be worth acting on, and a trace that
  // is not GPS noise: fixes bouncing around one spot add up to tens of km (seen on real
  // exports as "walks" of 26 km that Google measured at 0.1 km, start = end).
  const speeds = segmentSpeeds(trace).sort((x, y) => x - y);
  if (speeds.length < 3) return null;
  const displacementM = haversineM(trace[0][0], trace[0][1], trace[trace.length - 1][0], trace[trace.length - 1][1]);
  if (polylineLengthM(trace) > 3 * Math.max(a.distanceMeters || 0, displacementM) + 2000) return null;
  const p90 = speeds[Math.floor(speeds.length * 0.9)];
  const minutes = hours * 60;
  if (a.mode !== "flying" && avgKmh > 250 && lengthM >= 50_000) {
    return { mode: "flying", confidence: "high", by: "speed", railPct: null, ...base };
  }
  if (a.mode === "walking" && avgKmh > 15 && lengthM >= 2000) {
    return { mode: avgKmh <= 28 ? "cycling" : "car", confidence: "high", by: "speed", railPct: null, ...base };
  }
  // Slow on average is not enough (London traffic): every stretch must be walking pace.
  if ((a.mode === "car" || a.mode === "bus") && avgKmh < 6 && p90 < 12 && lengthM >= 500 && minutes >= 5) {
    return { mode: "walking", confidence: "high", by: "speed", railPct: null, ...base };
  }
  return null;
}

/** Binary min-heap keyed by cost, for the rail shortest path. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, node: number) {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Rail graph around one journey: nodes are rounded coordinates, so shared points join ways. */
class RailGraph {
  readonly lat: number[] = [];
  readonly lon: number[] = [];
  readonly adj: [number, number][][] = [];
  private readonly ids = new Map<string, number>();

  node(lat: number, lon: number): number {
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.lat.push(lat) - 1;
      this.lon.push(lon);
      this.adj.push([]);
      this.ids.set(key, id);
    }
    return id;
  }

  edge(a: number, b: number) {
    if (a === b) return;
    const w = haversineM(this.lat[a], this.lon[a], this.lat[b], this.lon[b]);
    this.adj[a].push([b, w]);
    this.adj[b].push([a, w]);
  }

  /** Shortest path from a to b, giving up beyond maxM. Node ids in order, or null. */
  path(a: number, b: number, maxM: number): number[] | null {
    const dist = new Map<number, number>([[a, 0]]);
    const prev = new Map<number, number>();
    const heap = new Heap();
    heap.push(0, a);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (u === b) break;
      if (d > (dist.get(u) ?? Infinity) || d > maxM) continue;
      for (const [v, w] of this.adj[u]) {
        const nd = d + w;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, u);
          heap.push(nd, v);
        }
      }
    }
    if (!dist.has(b) || dist.get(b)! > maxM) return null;
    const out = [b];
    while (out[out.length - 1] !== a) out.push(prev.get(out[out.length - 1])!);
    return out.reverse();
  }
}

/**
 * Draw a train journey along the tracks: snap each fix to the nearest rail segment and
 * follow the rail network between consecutive fixes. Legs that cannot be followed stay
 * straight between the fixes. Null when too little of the journey snaps.
 */
export function snapTraceToRail(trace: PathPoint[], rail: RailIndex): [number, number][] | null {
  const pts = cleanTrace(trace);
  if (pts.length < 2) return null;
  const g = new RailGraph();
  const segIds = new Set<number>();
  // Rail within ~600 m of the trace: sample along it and take nearby buckets.
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const steps = Math.max(1, Math.ceil(haversineM(a[0], a[1], b[0], b[1]) / 300));
    for (let k = 0; k <= steps; k++) {
      for (const id of rail.segmentsNear(a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps, 3)) {
        segIds.add(id);
      }
    }
  }
  const segNodes = new Map<number, [number, number]>();
  for (const id of segIds) {
    const s = rail.segs[id];
    const na = g.node(s.aLat, s.aLon);
    const nb = g.node(s.bLat, s.bLon);
    g.edge(na, nb);
    segNodes.set(id, [na, nb]);
  }
  // Ways simplified or clipped separately may not share a point at a junction: join an
  // end that dangles within 25 m of another line to that line's nearest segment.
  const degree = (n: number) => g.adj[n].length;
  for (const [na, nb] of segNodes.values()) {
    for (const n of [na, nb]) {
      if (degree(n) !== 1) continue;
      const touches = (seg: number) => {
        const ends = segNodes.get(seg);
        return !ends || ends[0] === n || ends[1] === n;
      };
      const hit = rail.nearest(g.lat[n], g.lon[n], 25, touches);
      if (!hit) continue;
      const [ha, hb] = segNodes.get(hit.seg)!;
      const join = g.node(hit.lat, hit.lon);
      g.edge(n, join);
      g.edge(join, ha);
      g.edge(join, hb);
    }
  }

  // Snap fixes onto the graph.
  const snapped = pts.map((p) => {
    const hit = rail.nearest(p[0], p[1], SNAP_M);
    if (!hit || !segNodes.has(hit.seg)) return null;
    const [ha, hb] = segNodes.get(hit.seg)!;
    const n = g.node(hit.lat, hit.lon);
    g.edge(n, ha);
    g.edge(n, hb);
    return n;
  });
  if (snapped.filter((n) => n !== null).length < Math.max(2, pts.length * 0.6)) return null;

  const out: PathPoint[] = [];
  const push = (lat: number, lon: number) => {
    const last = out[out.length - 1];
    if (!last || last[0] !== lat || last[1] !== lon) out.push([lat, lon, 0]);
  };
  let followed = 0;
  let legs = 0;
  for (let i = 0; i < pts.length; i++) {
    const n = snapped[i];
    if (i === 0) {
      push(n !== null ? g.lat[n] : pts[0][0], n !== null ? g.lon[n] : pts[0][1]);
      continue;
    }
    const m = snapped[i - 1];
    legs += 1;
    if (m !== null && n !== null) {
      const straight = haversineM(g.lat[m], g.lon[m], g.lat[n], g.lon[n]);
      const route = g.path(m, n, straight * 2 + 500);
      if (route) {
        followed += 1;
        for (const id of route) push(g.lat[id], g.lon[id]);
        continue;
      }
    }
    push(n !== null ? g.lat[n] : pts[i][0], n !== null ? g.lon[n] : pts[i][1]);
  }
  if (followed < legs * 0.6) return null;
  const thinned = thinTrace(out, { minSpacingM: 10, maxPoints: MAX_RAIL_GEOMETRY_POINTS });
  return thinned.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
}

export type JourneyModeFields = {
  mode: string;
  googleMode: string | null;
  modeDetail: ModeDetection | null;
  railGeometry: [number, number][] | null;
};

const RAIL_MODES = new Set(["train", "subway"]);

/**
 * Final mode fields for one journey. Starts from Google's label (`googleMode` when an
 * earlier run changed it), so running it again with a newer detector is safe.
 */
export function detectedModeFields(
  row: DetectableJourney & { googleMode?: string | null },
  rail: RailIndex | null,
): JourneyModeFields {
  const original = row.googleMode ?? row.mode;
  const d = detectJourneyMode({ ...row, mode: original }, rail);
  const mode = d?.confidence === "high" ? d.mode : original;
  const trace = rail && RAIL_MODES.has(mode) ? journeyTrace(row) : null;
  return {
    mode,
    googleMode: mode !== original ? original : null,
    modeDetail: d,
    railGeometry: trace && trace.length >= 3 ? snapTraceToRail(trace, rail!) : null,
  };
}

/** Every point a set of journeys touches, for picking which rail tiles to load. */
export function* journeyPoints(rows: Iterable<DetectableJourney>): Generator<[number, number]> {
  for (const r of rows) {
    yield [r.startLat, r.startLon];
    for (const p of r.path ?? []) yield [p[0], p[1]];
    yield [r.endLat, r.endLon];
  }
}

/** Detect modes for freshly parsed journeys; returns new rows with the mode fields set. */
export function applyModeDetection<T extends DetectableJourney>(rows: T[], rail: RailIndex | null): (T & JourneyModeFields)[] {
  return rows.map((r) => ({ ...r, ...detectedModeFields(r, rail) }));
}

#!/usr/bin/env node
/**
 * Builds the static rail map tiles that browser-side train detection reads.
 *
 * Run by hand only (`npm run rail:build`), never in CI or at runtime. It queries the
 * public Overpass API for railway lines and stations, then writes slippy-map z10 tiles:
 *
 *   apps/web/public/assets/rail/v1/10/{x}/{y}.json
 *     { "v": 1, "lines": [{ "k": "rail"|"subway"|"tram", "c": [[lat,lon], ...] }],
 *       "stations": [[lat,lon], ...] }
 *   apps/web/public/assets/rail/v1/index.json
 *     { v, z, built, regions, bbox: [west, south, east, north], tiles: ["x/y", ...] }
 *
 * Every z10 tile that overlaps a region bbox is fetched in full, so a tile in that range
 * that is missing from `tiles` means "no rail there".
 * Rail data (c) OpenStreetMap contributors, ODbL.
 *
 * Options:
 *   --refresh   ignore cached Overpass responses (scripts/rail/.cache, gitignored)
 *   --offline   build from the cache only, failing on any missing chunk
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Config ───────────────────────────────────────────────────────────────

/** Regions to cover. bbox is [west, south, east, north]. Add more and re-run. */
const REGIONS = [
  { id: 'great-britain', name: 'Great Britain and the Isle of Man', bbox: [-8.7, 49.8, 1.8, 60.9] },
  { id: 'ireland', name: 'Island of Ireland', bbox: [-10.7, 51.3, -5.4, 55.5] },
];
const CHUNK_DEG = 1;
const ZOOM = 10;
const FORMAT_VERSION = 1;
const SIMPLIFY_M = 10;
const TILE_PAD_M = 100;
const DECIMALS = 5;
const STATION_DEDUPE_M = 30;

/** Main instance first; on a busy or failed response the next public mirror is tried. */
const OVERPASS_URLS = [
  process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT =
  'LocationsRailTiles/1.0 (one-off UK and Ireland rail tile build for train detection; github.com/Arbzy1)';
const REQUEST_GAP_MS = 2500;
const MAX_ATTEMPTS = 10;

const LINE_KINDS = { rail: 'rail', light_rail: 'rail', narrow_gauge: 'rail', subway: 'subway', tram: 'tram' };
const EXCLUDED_SERVICE = new Set(['yard', 'siding', 'spur', 'crossover']);
const STATION_TYPES = new Set(['train', 'light_rail', 'subway', 'tram', 'narrow_gauge']);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const CACHE_DIR = path.join(here, '.cache', `v${FORMAT_VERSION}`);
const OUT_DIR = path.join(root, 'apps/web/public/assets/rail', `v${FORMAT_VERSION}`);

const args = new Set(process.argv.slice(2));
const REFRESH = args.has('--refresh');
const OFFLINE = args.has('--offline');

// ─── Tiles and geometry ───────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

const tilesPerSide = 2 ** ZOOM;
const lonToX = (lon) => Math.floor(((lon + 180) / 360) * tilesPerSide);
const latToY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * tilesPerSide);
};
const xToLon = (x) => (x / tilesPerSide) * 360 - 180;
const yToLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tilesPerSide))) * 180) / Math.PI;

/** z10 tile range { x0, x1, y0, y1 } overlapping a [west, south, east, north] bbox. */
function tileRange([w, s, e, n]) {
  return { x0: lonToX(w), x1: lonToX(e), y0: latToY(n), y1: latToY(s) };
}

/** Tile bounds padded by TILE_PAD_M: { s, w, n, e }. */
function paddedTileBox(x, y) {
  const n = yToLat(y);
  const s = yToLat(y + 1);
  const padLat = TILE_PAD_M / M_PER_DEG_LAT;
  const padLon = TILE_PAD_M / mPerDegLon(Math.max(Math.abs(n), Math.abs(s)));
  return { s: s - padLat, n: n + padLat, w: xToLon(x) - padLon, e: xToLon(x + 1) + padLon };
}

/** Douglas-Peucker on [lat, lon] points, in a local equirectangular metre frame. */
function simplify(points, tolM) {
  if (points.length < 3) return points;
  const kx = mPerDegLon(points[0][0]);
  const xy = points.map(([lat, lon]) => [lon * kx, lat * M_PER_DEG_LAT]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tolM * tolM;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const dx = xy[b][0] - ax;
    const dy = xy[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = tol2;
    for (let i = a + 1; i < b; i++) {
      let px = xy[i][0] - ax;
      let py = xy[i][1] - ay;
      if (len2 > 0) {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        px -= t * dx;
        py -= t * dy;
      }
      const d = px * px + py * py;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Liang-Barsky: clips segment a-b ([lat, lon]) to box, or null when it misses. */
function clipSegment(a, b, box) {
  const [y0, x0] = a;
  const dy = b[0] - y0;
  const dx = b[1] - x0;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, x0 - box.w],
    [dx, box.e - x0],
    [-dy, y0 - box.s],
    [dy, box.n - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return { p: [y0 + t0 * dy, x0 + t0 * dx], q: [y0 + t1 * dy, x0 + t1 * dx], t0, t1 };
}

/** Clips a polyline to box, returning the pieces inside it. */
function clipLine(points, box) {
  const pieces = [];
  let cur = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const r = clipSegment(points[i], points[i + 1], box);
    if (!r) {
      if (cur) pieces.push(cur);
      cur = null;
      continue;
    }
    if (!cur || r.t0 > 0) {
      if (cur) pieces.push(cur);
      cur = [r.p];
    }
    cur.push(r.q);
    if (r.t1 < 1) {
      pieces.push(cur);
      cur = null;
    }
  }
  if (cur) pieces.push(cur);
  return pieces;
}

const factor = 10 ** DECIMALS;
const round = (v) => Math.round(v * factor) / factor;

function roundLine(points) {
  const out = [];
  for (const [lat, lon] of points) {
    const p = [round(lat), round(lon)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

// ─── Overpass ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 1x1 degree chunks covering every z10 tile that overlaps a region. */
function chunkList() {
  const seen = new Map();
  for (const r of REGIONS) {
    const { x0, x1, y0, y1 } = tileRange(r.bbox);
    const w = xToLon(x0);
    const e = xToLon(x1 + 1);
    const n = yToLat(y0);
    const s = yToLat(y1 + 1);
    for (let lat = Math.floor(s); lat < n; lat += CHUNK_DEG) {
      for (let lon = Math.floor(w); lon < e; lon += CHUNK_DEG) {
        const key = `${lat}_${lon}`;
        if (!seen.has(key)) seen.set(key, { key, s: lat, w: lon, n: lat + CHUNK_DEG, e: lon + CHUNK_DEG });
      }
    }
  }
  return [...seen.values()];
}

function overpassQuery({ s, w, n, e }) {
  const bb = `${s},${w},${n},${e}`;
  return `[out:json][timeout:300][maxsize:1073741824];
(
  way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"]["service"!~"^(yard|siding|spur|crossover)$"](${bb});
  node["railway"~"^(station|halt)$"](${bb});
  node["public_transport"="station"]["train"="yes"](${bb});
);
out tags geom qt;`;
}

/** Sticks with the last server that answered, so a working mirror is not abandoned. */
let serverIndex = 0;

async function fetchChunk(chunk) {
  const file = path.join(CACHE_DIR, `${chunk.key}.json`);
  if (!REFRESH && existsSync(file)) return { data: JSON.parse(await readFile(file, 'utf8')), cached: true };
  if (OFFLINE) throw new Error(`chunk ${chunk.key} is not cached (--offline)`);

  let delay = 15_000;
  for (let attempt = 1; ; attempt++) {
    const url = OVERPASS_URLS[serverIndex];
    let status = 0;
    let reason = '';
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(360_000),
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: overpassQuery(chunk) }),
      });
      status = res.status;
      reason = res.statusText;
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        // Overpass reports timeouts and memory exhaustion as a 200 with a remark.
        if (typeof data.remark === 'string' && /runtime error|timed out|out of memory/i.test(data.remark)) {
          reason = data.remark;
        } else {
          await writeFile(file, text);
          return { data, cached: false };
        }
      }
    } catch (err) {
      reason = String(err?.cause?.code ?? err?.name ?? err);
    }
    const retryable = [0, 200, 429, 502, 503, 504].includes(status);
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Overpass ${status} ${reason} for chunk ${chunk.key}`);
    }
    serverIndex = (serverIndex + 1) % OVERPASS_URLS.length;
    console.warn(
      `  chunk ${chunk.key}: ${status} ${reason.slice(0, 80)} from ${new URL(url).host}; ` +
        `retry ${attempt} on ${new URL(OVERPASS_URLS[serverIndex]).host} in ${delay / 1000}s`,
    );
    await sleep(delay);
    // Back off once every server has been tried.
    if (serverIndex === 0) delay = Math.min(delay * 2, 240_000);
  }
}

// ─── Build ────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const chunks = chunkList();
  console.log(`Fetching ${chunks.length} chunks of ${CHUNK_DEG} degree from Overpass...`);

  const ways = new Map();
  const stationNodes = new Map();
  let fetched = 0;
  for (const [i, chunk] of chunks.entries()) {
    const { data, cached } = await fetchChunk(chunk);
    let nw = 0;
    let ns = 0;
    for (const el of data.elements ?? []) {
      const t = el.tags ?? {};
      if (t.disused === 'yes' || t.abandoned === 'yes') continue;
      if (el.type === 'way') {
        const kind = LINE_KINDS[t.railway];
        if (!kind || EXCLUDED_SERVICE.has(t.service) || t.construction || t['construction:railway']) continue;
        if (!el.geometry || el.geometry.length < 2) continue;
        // Some servers return null for nodes they lack; keep the unbroken runs, and prefer
        // a complete copy of the way from another chunk when one turns up.
        const complete = el.geometry.every(Boolean);
        const prev = ways.get(el.id);
        if (prev && (prev.complete || !complete)) continue;
        const runs = [[]];
        for (const g of el.geometry) {
          if (g) runs[runs.length - 1].push([g.lat, g.lon]);
          else if (runs[runs.length - 1].length) runs.push([]);
        }
        ways.set(el.id, { kind, complete, runs: runs.filter((r) => r.length >= 2) });
        if (!prev) nw++;
      } else if (el.type === 'node') {
        // station=miniature, monorail and the like do not help detect trains.
        if (t.railway === 'station' && t.station && !STATION_TYPES.has(t.station)) continue;
        if (!stationNodes.has(el.id)) {
          stationNodes.set(el.id, [el.lat, el.lon]);
          ns++;
        }
      }
    }
    if (!cached) fetched++;
    console.log(`  [${i + 1}/${chunks.length}] ${chunk.key}${cached ? ' (cache)' : ''}: +${nw} ways, +${ns} stations`);
    if (!cached && i + 1 < chunks.length) await sleep(REQUEST_GAP_MS);
  }
  console.log(`Fetched ${fetched} chunks; ${ways.size} ways, ${stationNodes.size} station nodes.`);

  const tiles = new Map();
  const tileFor = (x, y) => {
    const key = `${x}/${y}`;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { x, y, lines: [], stations: [] }));
    return t;
  };
  const padLat = TILE_PAD_M / M_PER_DEG_LAT;

  const polylines = [...ways.values()].flatMap(({ kind, runs }) => runs.map((points) => ({ kind, points })));
  for (const { kind, points } of polylines) {
    const simple = simplify(points, SIMPLIFY_M);
    let s = Infinity;
    let n = -Infinity;
    let w = Infinity;
    let e = -Infinity;
    for (const [lat, lon] of simple) {
      s = Math.min(s, lat);
      n = Math.max(n, lat);
      w = Math.min(w, lon);
      e = Math.max(e, lon);
    }
    const padLon = TILE_PAD_M / mPerDegLon(n);
    const { x0, x1, y0, y1 } = tileRange([w - padLon, s - padLat, e + padLon, n + padLat]);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const piece of clipLine(simple, paddedTileBox(x, y))) {
          const c = roundLine(piece);
          if (c.length >= 2) tileFor(x, y).lines.push({ k: kind, c });
        }
      }
    }
  }

  // Drop near-duplicate stations (railway=station and public_transport=station often both exist).
  const stations = [];
  const grid = new Map();
  for (const [lat, lon] of stationNodes.values()) {
    const kx = mPerDegLon(lat);
    const ci = Math.floor(lat * 1000);
    const cj = Math.floor(lon * 1000);
    let dup = false;
    for (let di = -1; di <= 1 && !dup; di++) {
      for (let dj = -1; dj <= 1 && !dup; dj++) {
        dup = (grid.get(`${ci + di}_${cj + dj}`) ?? []).some(
          ([la, lo]) => Math.hypot((la - lat) * M_PER_DEG_LAT, (lo - lon) * kx) < STATION_DEDUPE_M,
        );
      }
    }
    if (dup) continue;
    const key = `${ci}_${cj}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push([lat, lon]);
    stations.push([lat, lon]);
  }
  for (const [lat, lon] of stations) {
    const padLon = TILE_PAD_M / mPerDegLon(lat);
    const { x0, x1, y0, y1 } = tileRange([lon - padLon, lat - padLat, lon + padLon, lat + padLat]);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) tileFor(x, y).stations.push([round(lat), round(lon)]);
    }
  }

  // Keep tiles that overlap a configured region; `out geom` returns whole ways past the edge.
  const ranges = REGIONS.map((r) => tileRange(r.bbox));
  const covered = (x, y) => ranges.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

  await rm(OUT_DIR, { recursive: true, force: true });
  const written = [];
  let totalBytes = 0;
  let maxBytes = 0;
  let maxTile = '';
  const sorted = [...tiles.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const t of sorted) {
    if (!covered(t.x, t.y) || (t.lines.length === 0 && t.stations.length === 0)) continue;
    const body = JSON.stringify({ v: FORMAT_VERSION, lines: t.lines, stations: t.stations });
    const dir = path.join(OUT_DIR, String(ZOOM), String(t.x));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${t.y}.json`), body);
    written.push(`${t.x}/${t.y}`);
    totalBytes += body.length;
    if (body.length > maxBytes) {
      maxBytes = body.length;
      maxTile = `${t.x}/${t.y}`;
    }
  }

  const index = {
    v: FORMAT_VERSION,
    z: ZOOM,
    built: new Date().toISOString().slice(0, 10),
    regions: REGIONS.map(({ id, name, bbox }) => ({ id, name, bbox })),
    bbox: [
      Math.min(...REGIONS.map((r) => r.bbox[0])),
      Math.min(...REGIONS.map((r) => r.bbox[1])),
      Math.max(...REGIONS.map((r) => r.bbox[2])),
      Math.max(...REGIONS.map((r) => r.bbox[3])),
    ],
    tiles: written,
  };
  const indexBody = JSON.stringify(index);
  await writeFile(path.join(OUT_DIR, 'index.json'), indexBody);
  totalBytes += indexBody.length;

  const mib = (b) => (b / 1024 / 1024).toFixed(2);
  console.log(`\nWrote ${written.length} tiles and index.json to ${path.relative(root, OUT_DIR)}`);
  console.log(`Total ${mib(totalBytes)} MiB in ${written.length + 1} files; largest tile ${maxTile} at ${mib(maxBytes)} MiB.`);
  console.log(`Stations: ${stations.length} after de-duplication.`);
  if (Math.max(maxBytes, indexBody.length) > 25 * 1024 * 1024) throw new Error('A file is over the 25 MiB asset limit');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

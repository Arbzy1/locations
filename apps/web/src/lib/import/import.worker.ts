/// <reference lib="webworker" />
/**
 * Off-main-thread Timeline work: unzip, parse and aggregate. Runs the same code the
 * server and CLI use (@locations/db/pure) so results match, without freezing the page
 * on large exports.
 */
import {
  applyModeDetection,
  computeTenantAggregates,
  detectedModeFields,
  journeyPoints,
  loadRailIndex,
  countTimelineRecords,
  detectTimelineFormat,
  extractTimelineJsonFromZip,
  isZipMagic,
  parseTimelineJson,
  type ActivityRow,
  type DetectableJourney,
  type RailCoverage,
  type RailIndex,
  type RailTile,
  type VisitRow,
} from '@locations/db/pure';
import type { ModeUpdate, WorkerRequest, WorkerResponse } from './import-types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Static OpenStreetMap rail tiles (scripts/rail), served from /assets without the Worker. */
const RAIL_BASE = '/assets/rail/v1';
let coverage: Promise<RailCoverage | null> | null = null;
const tileCache = new Map<string, Promise<RailTile | null>>();

function railCoverage(): Promise<RailCoverage | null> {
  coverage ??= fetch(`${RAIL_BASE}/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RailCoverage>) : null))
    .catch(() => null);
  return coverage;
}

function railTile(z: number, key: string): Promise<RailTile | null> {
  let tile = tileCache.get(key);
  if (!tile) {
    tile = fetch(`${RAIL_BASE}/${z}/${key}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RailTile>) : null))
      .catch(() => null);
    tileCache.set(key, tile);
  }
  return tile;
}

/** Rail lines near these journeys, or null when the rail map is unavailable (speed checks only). */
async function railFor(rows: DetectableJourney[]): Promise<RailIndex | null> {
  const cov = await railCoverage();
  return cov ? loadRailIndex(cov, journeyPoints(rows), (key) => railTile(cov.z, key)) : null;
}

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  if (req.type === 'parse') {
    const bytes = await req.file.arrayBuffer();
    let text: string;
    let chosenPath: string | null = null;
    let candidates: string[] = [];
    if (req.file.name.toLowerCase().endsWith('.zip') || isZipMagic(bytes)) {
      const zip = await extractTimelineJsonFromZip(bytes);
      text = zip.text;
      chosenPath = zip.chosenPath;
      candidates = zip.candidates;
    } else {
      text = new TextDecoder().decode(bytes);
    }
    let raw: unknown;
    try {
      // Strip a UTF-8 byte-order mark, which some exports start with.
      raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch {
      throw new Error('This file is not valid JSON. Export Timeline again, or use the Takeout zip.');
    }
    const format = detectTimelineFormat(raw);
    const parsedCount = countTimelineRecords(raw);
    const parsed = parseTimelineJson(raw);
    // Trains Google labelled as driving (and similar): fixed before upload.
    const activities = applyModeDetection(parsed.activities, await railFor(parsed.activities));
    return {
      type: 'parsed',
      format,
      parsedCount,
      chosenPath,
      candidates,
      visits: parsed.visits,
      activities,
      memories: (parsed.memories ?? []).map((m) => ({ start: m.start, end: m.end, distanceKm: m.distanceKm })),
    };
  }
  if (req.type === 'detect') {
    const rows = req.rows.filter((r) => !r.overridden);
    const rail = await railFor(rows);
    const updates: ModeUpdate[] = [];
    for (const r of rows) {
      const next = detectedModeFields(r, rail);
      // Send only rows that change: a new mode, or detail / rail line to set or clear.
      const changed =
        next.mode !== r.mode ||
        next.googleMode !== (r.googleMode ?? null) ||
        next.modeDetail !== null ||
        next.railGeometry !== null ||
        next.measuredDistanceM !== null ||
        r.hasDetail ||
        r.hasRail;
      if (changed) updates.push({ id: r.id, ...next });
    }
    return { type: 'detected', updates, checked: rows.length };
  }
  const result = computeTenantAggregates(
    'self',
    req.visits as VisitRow[],
    req.activities.map((a) => ({ ...a, path: null })) as ActivityRow[],
    req.timezone,
  );
  return { type: 'aggregated', dayStats: result.dayStats, analytics: result.analytics };
}

ctx.onmessage = (event: MessageEvent<WorkerRequest & { id: number }>) => {
  const { id, ...req } = event.data;
  handle(req as WorkerRequest).then(
    (res) => ctx.postMessage({ id, ok: true, res }),
    (err: unknown) => ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
};

/**
 * Timeline parsing: every Google export format to stay and journey drafts. Pure (no
 * database, no Node APIs) so the browser can parse an export before uploading rows;
 * the Worker free plan cannot afford the CPU.
 */
import type { PathPoint } from "./schema.js";
import type { ModeDetection } from "./rail.js";
import {
  classifyLocation,
  haversineM,
  mapTransportMode,
  parseGeo,
  visitPlaceKey,
} from "./geo.js";
import { MAX_FIX_ACCURACY_M, detectStaysAndMoves, pathRecord } from "./raw-signals.js";

export type RawTimelineRecord = {
  startTime?: string;
  endTime?: string;
  visit?: {
    /** 0 for a top-level stay; higher levels are stays nested inside it (a shop in a mall). */
    hierarchyLevel?: string | number;
    topCandidate?: {
      placeLocation?: string;
      semanticType?: string;
      placeID?: string;
      /** Google's place name (older Takeout exports only). */
      name?: string;
    };
  };
  activity?: {
    start?: string;
    end?: string;
    distanceMeters?: number | string;
    topCandidate?: { type?: string };
  };
  /** Google's own "trip" summaries: where you went and how far from home. */
  timelineMemory?: {
    destinations?: Array<{ identifier?: string }>;
    distanceFromOriginKms?: string | number;
  };
  /** GPS breadcrumbs. Classic exports use minute offsets; semanticSegments use `time`. */
  timelinePath?: Array<{
    point?: string;
    durationMinutesOffsetFromStartTime?: string | number;
    time?: string;
  }>;
};

export type VisitDraft = {
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
  placeKey: string;
  googleName: string | null;
};

export type ActivityDraft = {
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
  /** Set by GPS mode detection (`applyModeDetection` in rail.ts), not by parsing. */
  googleMode?: string | null;
  modeDetail?: ModeDetection | null;
  railGeometry?: [number, number][] | null;
};

/** A trip Google itself recognised (Timeline `timelineMemory`). */
export type TimelineMemory = {
  start: string;
  end: string;
  destinations: string[];
  distanceKm: number | null;
};

export type ParsedTimeline = {
  visits: VisitDraft[];
  activities: ActivityDraft[];
  memories?: TimelineMemory[];
};

function latLngFromE7(point: { latE7?: number; lngE7?: number } | null | undefined): [number, number] | null {
  if (!point || point.latE7 == null || point.lngE7 == null) return null;
  return [point.latE7 / 1e7, point.lngE7 / 1e7];
}

/** Parse `"51.3667281°, -0.1896562°"` style coordinates from Timeline.json. */
function parseDegreeLatLng(raw: string | undefined | null): [number, number] | null {
  if (!raw) return null;
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*°\s*,\s*(-?\d+(?:\.\d+)?)\s*°/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return [lat, lon];
}

function coordsFromLocation(
  loc:
    | string
    | { latE7?: number; lngE7?: number; latLng?: string }
    | null
    | undefined,
): [number, number] | null {
  if (!loc) return null;
  if (typeof loc === "string") {
    return parseGeo(loc) ?? parseDegreeLatLng(loc);
  }
  if (loc.latLng) return parseDegreeLatLng(loc.latLng);
  return latLngFromE7(loc);
}

function toGeo(lat: number, lon: number): string {
  return `geo:${lat},${lon}`;
}

function titleCaseSemantic(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  const lower = raw.replace(/_/g, " ").toLowerCase();
  if (lower === "unknown") return "Unknown";
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

type TimelineEdit = {
  inferredSemanticSegment?: NestedSemanticSegment;
  userEditedSemanticSegment?: NestedSemanticSegment;
  rawSignal?: {
    signal?: {
      position?: {
        point?: { latE7?: number; lngE7?: number };
        timestamp?: string;
      };
    };
  };
};

type NestedSemanticSegment = {
  startTime?: string;
  endTime?: string;
  segment?: {
    visit?: SemanticVisit;
    activity?: SemanticActivity;
  };
};

type SemanticVisit = {
  hierarchyLevel?: string | number;
  topCandidate?: {
    placeId?: string;
    placeID?: string;
    semanticType?: string;
    placeLocation?: string | { latE7?: number; lngE7?: number; latLng?: string };
  };
};

type SemanticActivity = {
  start?: string | { latE7?: number; lngE7?: number; latLng?: string };
  end?: string | { latE7?: number; lngE7?: number; latLng?: string };
  distanceMeters?: number | string;
  topCandidate?: { type?: string };
};

type FlatSemanticSegment = {
  startTime?: string;
  endTime?: string;
  visit?: SemanticVisit;
  activity?: SemanticActivity;
  timelinePath?: Array<{ point?: string; time?: string }>;
};

function pushVisitActivity(
  records: RawTimelineRecord[],
  startTime: string,
  endTime: string,
  visit: SemanticVisit | undefined,
  activity: SemanticActivity | undefined,
) {
  if (visit) {
    const top = visit.topCandidate ?? {};
    const coords = coordsFromLocation(top.placeLocation);
    if (!coords) return;
    records.push({
      startTime,
      endTime,
      visit: {
        hierarchyLevel: visit.hierarchyLevel,
        topCandidate: {
          placeLocation: toGeo(coords[0], coords[1]),
          semanticType: titleCaseSemantic(top.semanticType),
          placeID: top.placeId ?? top.placeID,
        },
      },
    });
    return;
  }

  if (activity) {
    const startCoords = coordsFromLocation(activity.start);
    const endCoords = coordsFromLocation(activity.end);
    if (!startCoords || !endCoords) return;
    records.push({
      startTime,
      endTime,
      activity: {
        start: toGeo(startCoords[0], startCoords[1]),
        end: toGeo(endCoords[0], endCoords[1]),
        distanceMeters: activity.distanceMeters,
        topCandidate: { type: activity.topCandidate?.type },
      },
    });
  }
}

function fromSemanticSegments(segments: FlatSemanticSegment[]): RawTimelineRecord[] {
  const records: RawTimelineRecord[] = [];
  for (const seg of segments) {
    const startTime = seg.startTime ?? "";
    const endTime = seg.endTime ?? "";
    if (!startTime || !endTime) continue;
    if (Array.isArray(seg.timelinePath) && seg.timelinePath.length) {
      records.push({ startTime, endTime, timelinePath: seg.timelinePath });
    }
    if (!seg.visit && !seg.activity) continue;
    pushVisitActivity(records, startTime, endTime, seg.visit, seg.activity);
  }
  return records;
}

function fromTimelineEdits(edits: TimelineEdit[]): RawTimelineRecord[] {
  const records: RawTimelineRecord[] = [];
  const seenSegmentKeys = new Set<string>();

  const segments: Array<{ seg: NestedSemanticSegment; edited: boolean }> = [];
  for (const edit of edits) {
    if (edit.userEditedSemanticSegment) {
      segments.push({ seg: edit.userEditedSemanticSegment, edited: true });
    }
    if (edit.inferredSemanticSegment) {
      segments.push({ seg: edit.inferredSemanticSegment, edited: false });
    }
  }
  segments.sort((a, b) => Number(b.edited) - Number(a.edited));

  for (const { seg } of segments) {
    const startTime = seg.startTime ?? "";
    const endTime = seg.endTime ?? "";
    if (!startTime || !endTime) continue;
    const key = `${startTime.slice(0, 16)}|${endTime.slice(0, 16)}|${seg.segment?.visit ? "v" : "a"}`;
    if (seenSegmentKeys.has(key)) continue;
    seenSegmentKeys.add(key);
    pushVisitActivity(records, startTime, endTime, seg.segment?.visit, seg.segment?.activity);
  }

  // Raw positions are GPS fixes, not stays: they become journey paths and visit
  // fixes, or (with no semantic segments at all) the input to stay detection.
  const fixes: PathPoint[] = [];
  for (const edit of edits) {
    const position = edit.rawSignal?.signal?.position;
    if (!position?.timestamp) continue;
    const coords = latLngFromE7(position.point);
    const ms = Date.parse(position.timestamp);
    if (!coords || !Number.isFinite(ms)) continue;
    fixes.push([round6(coords[0]), round6(coords[1]), Math.round(ms / 1000)]);
  }
  if (!records.length) return detectStaysAndMoves(fixes);
  const path = pathRecord(fixes.sort((a, b) => a[2] - b[2]));
  if (path) records.push(path);
  return records;
}

/** Normalize classic array, semanticSegments Timeline.json, or Timeline Edits. */
export function normalizeTimelineInput(raw: unknown): RawTimelineRecord[] {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Timeline JSON must be an array or a Timeline export object");
  }

  if (Array.isArray(raw)) return raw as RawTimelineRecord[];

  const obj = raw as Record<string, unknown>;
  if ("timelineEnabled" in obj || "deviceSettings" in obj) {
    throw new Error(
      "This looks like Timeline Settings.json, not location history. Use Timeline.json (semanticSegments) or Timeline Edits.json.",
    );
  }

  if (Array.isArray(obj.semanticSegments)) {
    return fromSemanticSegments(obj.semanticSegments as FlatSemanticSegment[]);
  }

  if (Array.isArray(obj.timelineEdits)) {
    return fromTimelineEdits(obj.timelineEdits as TimelineEdit[]);
  }

  if (Array.isArray(obj.locations)) {
    return fromRecordsJson(obj.locations as Array<Record<string, unknown>>);
  }

  if (Array.isArray(obj.timelineObjects)) {
    return fromLegacyTimelineObjects(obj.timelineObjects as LegacyTimelineObject[]);
  }

  throw new Error(
    "Timeline JSON must be a visit/activity array, a semanticSegments Timeline.json, a Timeline Edits export, or Records.json",
  );
}

type E7Point = { latitudeE7?: number; longitudeE7?: number; latE7?: number; lngE7?: number };
type LegacyDuration = {
  startTimestamp?: string;
  endTimestamp?: string;
  startTimestampMs?: string;
  endTimestampMs?: string;
};
type LegacyPlaceVisit = {
  location?: E7Point & { placeId?: string; semanticType?: string; name?: string };
  duration?: LegacyDuration;
  childVisits?: LegacyPlaceVisit[];
};
type LegacyTimelineObject = {
  placeVisit?: LegacyPlaceVisit;
  activitySegment?: {
    startLocation?: E7Point;
    endLocation?: E7Point;
    duration?: LegacyDuration;
    distance?: number;
    activityType?: string;
    simplifiedRawPath?: { points?: Array<E7Point & { timestamp?: string; timestampMs?: string }> };
  };
};

function legacyTime(ts: string | undefined, ms: string | undefined): string {
  if (ts) return ts;
  const n = Number(ms);
  return Number.isFinite(n) && ms ? new Date(n).toISOString() : "";
}

function legacyCoords(p: E7Point | undefined): [number, number] | null {
  const lat = p?.latitudeE7 ?? p?.latE7;
  const lon = p?.longitudeE7 ?? p?.lngE7;
  if (lat == null || lon == null) return null;
  return [lat / 1e7, lon / 1e7];
}

/** Older Takeout "Semantic Location History" monthly files (`timelineObjects`). */
function fromLegacyTimelineObjects(objects: LegacyTimelineObject[]): RawTimelineRecord[] {
  const records: RawTimelineRecord[] = [];
  const pushVisit = (pv: LegacyPlaceVisit, level: number) => {
    const startTime = legacyTime(pv.duration?.startTimestamp, pv.duration?.startTimestampMs);
    const endTime = legacyTime(pv.duration?.endTimestamp, pv.duration?.endTimestampMs);
    const coords = legacyCoords(pv.location);
    if (startTime && endTime && coords) {
      records.push({
        startTime,
        endTime,
        visit: {
          hierarchyLevel: level,
          topCandidate: {
            placeLocation: toGeo(coords[0], coords[1]),
            semanticType: titleCaseSemantic(pv.location?.semanticType?.replace(/^TYPE_/, "")),
            placeID: pv.location?.placeId,
            name: pv.location?.name,
          },
        },
      });
    }
    for (const child of pv.childVisits ?? []) pushVisit(child, level + 1);
  };

  for (const obj of objects) {
    if (obj.placeVisit) {
      pushVisit(obj.placeVisit, 0);
      continue;
    }
    const seg = obj.activitySegment;
    if (!seg) continue;
    const startTime = legacyTime(seg.duration?.startTimestamp, seg.duration?.startTimestampMs);
    const endTime = legacyTime(seg.duration?.endTimestamp, seg.duration?.endTimestampMs);
    const from = legacyCoords(seg.startLocation);
    const to = legacyCoords(seg.endLocation);
    if (!startTime || !endTime || !from || !to) continue;
    records.push({
      startTime,
      endTime,
      activity: {
        start: toGeo(from[0], from[1]),
        end: toGeo(to[0], to[1]),
        distanceMeters: seg.distance,
        topCandidate: { type: seg.activityType },
      },
    });
    const fixes: PathPoint[] = [];
    for (const pt of seg.simplifiedRawPath?.points ?? []) {
      const c = legacyCoords(pt);
      const ms = Date.parse(legacyTime(pt.timestamp, pt.timestampMs));
      if (c && Number.isFinite(ms)) fixes.push([round6(c[0]), round6(c[1]), Math.round(ms / 1000)]);
    }
    const path = pathRecord(fixes.sort((a, b) => a[2] - b[2]));
    if (path) records.push(path);
  }
  return records;
}

function fromRecordsJson(locations: Array<Record<string, unknown>>): RawTimelineRecord[] {
  const fixes: PathPoint[] = [];
  for (const loc of locations) {
    const latE7 = Number(loc.latitudeE7 ?? loc.latE7);
    const lngE7 = Number(loc.longitudeE7 ?? loc.lngE7);
    if (!Number.isFinite(latE7) || !Number.isFinite(lngE7)) continue;
    const accuracy = Number(loc.accuracy);
    if (Number.isFinite(accuracy) && accuracy > MAX_FIX_ACCURACY_M) continue;
    const ts =
      (typeof loc.timestamp === "string" && loc.timestamp) ||
      (typeof loc.timestampMs === "string" && loc.timestampMs) ||
      (typeof loc.timestampMs === "number" && String(loc.timestampMs)) ||
      "";
    if (!ts) continue;
    const ms = /^\d+$/.test(ts) ? Number(ts) : Date.parse(ts);
    if (!Number.isFinite(ms)) continue;
    fixes.push([round6(latE7 / 1e7), round6(lngE7 / 1e7), Math.round(ms / 1000)]);
  }
  return detectStaysAndMoves(fixes);
}

/** Seconds of slack around a journey window; classic path offsets are whole minutes. */
const PATH_TOLERANCE_S = 30;
/** Upper bound per journey so one long flight or drive cannot bloat a row. */
export const MAX_PATH_POINTS = 300;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Read GPS fixes from one `timelinePath` record (classic minute offsets or ISO `time`). */
export function pathPointsFromRecord(record: RawTimelineRecord): PathPoint[] {
  if (!Array.isArray(record.timelinePath)) return [];
  const baseMs = Date.parse(record.startTime ?? "");
  const out: PathPoint[] = [];
  for (const p of record.timelinePath) {
    const coords = coordsFromLocation(p?.point);
    if (!coords) continue;
    let ms = p.time ? Date.parse(p.time) : NaN;
    if (!Number.isFinite(ms) && p.durationMinutesOffsetFromStartTime != null) {
      const offset = Number(p.durationMinutesOffsetFromStartTime);
      if (Number.isFinite(offset) && Number.isFinite(baseMs)) ms = baseMs + offset * 60_000;
    }
    if (!Number.isFinite(ms)) continue;
    out.push([round6(coords[0]), round6(coords[1]), Math.round(ms / 1000)]);
  }
  return out;
}

function capPath(points: PathPoint[], max: number): PathPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: PathPoint[] = [];
  for (let k = 0; k < max; k++) out.push(points[Math.round(k * step)]);
  return out;
}

/**
 * Give each journey the GPS fixes recorded during its time window.
 * Fixes inside visits are dropped: they only describe where you stood still.
 * Returns how many points were attached.
 */
export function attachPathPoints(
  rows: Array<{ start: string; end: string; path: PathPoint[] | null }>,
  points: PathPoint[],
): number {
  if (!points.length || !rows.length) return 0;
  // Stable sort keeps the in-record order of fixes that share a minute.
  const sorted = [...points].sort((a, b) => a[2] - b[2]);
  let attached = 0;
  for (const row of rows) {
    const startS = Date.parse(row.start) / 1000 - PATH_TOLERANCE_S;
    const endS = Date.parse(row.end) / 1000 + PATH_TOLERANCE_S;
    if (!Number.isFinite(startS) || !Number.isFinite(endS)) continue;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid][2] < startS) lo = mid + 1;
      else hi = mid;
    }
    const picked: PathPoint[] = [];
    for (let i = lo; i < sorted.length && sorted[i][2] <= endS; i++) {
      const p = sorted[i];
      const prev = picked[picked.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
      picked.push(p);
    }
    if (!picked.length) continue;
    row.path = capPath(picked, MAX_PATH_POINTS);
    attached += row.path.length;
  }
  return attached;
}

/** Fixes further than this from Google's place are treated as a different spot. */
const VISIT_FIX_MAX_M = 1500;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Pin each stay to where the phone actually was: the median of GPS fixes
 * recorded during the visit, when at least two sit near Google's place.
 * Returns how many visits got a position.
 */
export function attachVisitFixes(
  rows: Array<{
    start: string;
    end: string;
    lat: number;
    lon: number;
    fixLat: number | null;
    fixLon: number | null;
    fixCount: number | null;
  }>,
  points: PathPoint[],
): number {
  if (!points.length || !rows.length) return 0;
  const sorted = [...points].sort((a, b) => a[2] - b[2]);
  let fixed = 0;
  for (const row of rows) {
    const startS = Date.parse(row.start) / 1000 - PATH_TOLERANCE_S;
    const endS = Date.parse(row.end) / 1000 + PATH_TOLERANCE_S;
    if (!Number.isFinite(startS) || !Number.isFinite(endS)) continue;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid][2] < startS) lo = mid + 1;
      else hi = mid;
    }
    const near: PathPoint[] = [];
    for (let i = lo; i < sorted.length && sorted[i][2] <= endS; i++) {
      if (haversineM(row.lat, row.lon, sorted[i][0], sorted[i][1]) <= VISIT_FIX_MAX_M) near.push(sorted[i]);
    }
    if (near.length < 2) continue;
    row.fixLat = round6(median(near.map((p) => p[0])));
    row.fixLon = round6(median(near.map((p) => p[1])));
    row.fixCount = near.length;
    fixed += 1;
  }
  return fixed;
}

function parseClassicRecords(raw: RawTimelineRecord[]): ParsedTimeline {
  const visitRows: VisitDraft[] = [];
  const visitLevels: number[] = [];
  const activityRows: ActivityDraft[] = [];
  const pathPoints: PathPoint[] = [];
  const memories: TimelineMemory[] = [];

  for (const record of raw) {
    const startTime = record.startTime ?? "";
    const endTime = record.endTime ?? "";
    if (!startTime || !endTime) continue;

    if (record.timelinePath) {
      for (const p of pathPointsFromRecord(record)) pathPoints.push(p);
    }
    if (record.timelineMemory) {
      const km = Number(record.timelineMemory.distanceFromOriginKms);
      memories.push({
        start: startTime,
        end: endTime,
        destinations: (record.timelineMemory.destinations ?? [])
          .map((d) => d.identifier)
          .filter((id): id is string => Boolean(id)),
        distanceKm: Number.isFinite(km) ? km : null,
      });
    }

    if (record.visit) {
      const top = record.visit.topCandidate ?? {};
      const coords = parseGeo(top.placeLocation);
      if (!coords) continue;
      const startDt = new Date(startTime);
      const endDt = new Date(endTime);
      const duration = (endDt.getTime() - startDt.getTime()) / 60000;
      visitRows.push({
        start: startTime,
        end: endTime,
        date: startTime.slice(0, 10),
        lat: coords[0],
        lon: coords[1],
        cluster: classifyLocation(coords[0], coords[1]),
        semanticType: top.semanticType ?? "Unknown",
        placeId: top.placeID ?? null,
        durationMinutes: Math.round(duration * 10) / 10,
        fixLat: null,
        fixLon: null,
        fixCount: null,
        placeKey: visitPlaceKey(top.placeID, coords[0], coords[1]),
        googleName: top.name?.trim().slice(0, 200) || null,
      });
      visitLevels.push(Number(record.visit.hierarchyLevel ?? 0) || 0);
    } else if (record.activity) {
      const act = record.activity;
      const top = act.topCandidate ?? {};
      const startCoords = parseGeo(act.start);
      const endCoords = parseGeo(act.end);
      if (!startCoords || !endCoords) continue;
      const startDt = new Date(startTime);
      const endDt = new Date(endTime);
      const duration = (endDt.getTime() - startDt.getTime()) / 60000;
      activityRows.push({
        start: startTime,
        end: endTime,
        date: startTime.slice(0, 10),
        startLat: startCoords[0],
        startLon: startCoords[1],
        endLat: endCoords[0],
        endLon: endCoords[1],
        mode: mapTransportMode(top.type ?? "unknown"),
        distanceMeters: Number(act.distanceMeters ?? 0),
        durationMinutes: Math.round(duration * 10) / 10,
        path: null,
      });
    }
  }

  const leafVisits = splitNestedVisits(visitRows, visitLevels);
  attachPathPoints(activityRows, pathPoints);
  attachVisitFixes(leafVisits, pathPoints);

  return { visits: leafVisits, activities: activityRows, memories };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Named-trip rows for Google's own trips, with ids stable per source so renames survive. */
export function namedTripsFromMemories(memories: TimelineMemory[], sourceId: string) {
  return memories
    .map((m) => {
      const start = m.start.slice(0, 10);
      const end = m.end.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
      const dates: string[] = [];
      for (let t = Date.parse(start); t <= Date.parse(end) && dates.length < 60; t += 86_400_000) {
        dates.push(new Date(t).toISOString().slice(0, 10));
      }
      const month = `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
      const away = m.distanceKm ? ` (${Math.round(m.distanceKm)} km from home)` : "";
      return { id: `google-${sourceId}-${start}-${end}`, name: `Trip, ${month}${away}`, start, end, dates };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

/** Parent fragments shorter than this around a nested stay are dropped. */
const MIN_FRAGMENT_MINUTES = 2;

/**
 * Google nests stays (a shop inside a shopping centre) as overlapping visits with a
 * higher `hierarchyLevel`. Importing both counts that time twice, so each parent is
 * cut around its nested stays and only the uncovered pieces are kept.
 */
export function splitNestedVisits(rows: VisitDraft[], levels: number[]): VisitDraft[] {
  if (!levels.some((l) => l > 0)) return rows;
  const items = rows.map((row, i) => ({
    row,
    level: levels[i] ?? 0,
    startMs: Date.parse(row.start),
    endMs: Date.parse(row.end),
  }));
  // Only nested stays can be children; scanning just those keeps this near-linear.
  const nested = items.filter((it) => it.level > 0).sort((a, b) => a.startMs - b.startMs);
  const out: VisitDraft[] = [];

  for (const parent of items) {
    const children = nested.filter(
      (c) =>
        c !== parent &&
        c.level > parent.level &&
        c.startMs < parent.endMs &&
        c.endMs > parent.startMs,
    );
    if (!children.length) {
      out.push(parent.row);
      continue;
    }
    let cursorMs = parent.startMs;
    let cursorIso = parent.row.start;
    const piece = (endMs: number, endIso: string) => {
      const minutes = (endMs - cursorMs) / 60000;
      if (minutes < MIN_FRAGMENT_MINUTES) return;
      out.push({
        ...parent.row,
        start: cursorIso,
        end: endIso,
        date: cursorIso.slice(0, 10),
        durationMinutes: Math.round(minutes * 10) / 10,
      });
    };
    for (const child of children) {
      if (child.startMs > cursorMs) piece(child.startMs, child.row.start);
      if (child.endMs > cursorMs) {
        cursorMs = child.endMs;
        cursorIso = child.row.end;
      }
    }
    if (parent.endMs > cursorMs) piece(parent.endMs, parent.row.end);
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Parse Google Timeline JSON (classic array or Timeline Edits export). */
export function parseTimelineJson(raw: unknown): ParsedTimeline {
  const records = normalizeTimelineInput(raw);
  const parsed = parseClassicRecords(records);

  if (parsed.visits.length === 0 && parsed.activities.length === 0) {
    throw new Error(
      "No visit or activity records found. Ensure the file is Timeline Edits.json or a visit/activity JSON array.",
    );
  }

  return parsed;
}

export type TimelineFormat = "classic" | "semantic" | "records" | "edits" | "legacy";

export function detectTimelineFormat(raw: unknown): TimelineFormat {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Timeline JSON must be an array or a Timeline export object");
  }
  if (Array.isArray(raw)) return "classic";
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.semanticSegments)) return "semantic";
  if (Array.isArray(obj.timelineEdits)) return "edits";
  if (Array.isArray(obj.locations)) return "records";
  if (Array.isArray(obj.timelineObjects)) return "legacy";
  throw new Error(
    "Timeline JSON must be a visit/activity array, a semanticSegments Timeline.json, a Timeline Edits export, or Records.json",
  );
}

/** Records in an export, whatever its shape (array, semanticSegments, timelineEdits, Records.json). */
export function countTimelineRecords(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["semanticSegments", "timelineEdits", "locations", "timelineObjects"]) {
      if (Array.isArray(obj[key])) return (obj[key] as unknown[]).length;
    }
  }
  return 0;
}

export function datesFromParsed(parsed: ParsedTimeline): string[] {
  const set = new Set<string>();
  for (const v of parsed.visits) set.add(v.date);
  for (const a of parsed.activities) set.add(a.date);
  return [...set].sort();
}

export function importDayDiff(incoming: string[], existing: string[]) {
  const exist = new Set(existing);
  const overlapping = incoming.filter((d) => exist.has(d));
  const newDays = incoming.filter((d) => !exist.has(d));
  return {
    overlappingDays: overlapping.length,
    newDays: newDays.length,
    existingDays: existing.length,
    overlappingSample: overlapping.slice(0, 12),
  };
}

export type TimezoneWarning = {
  warn: boolean;
  skewedShare: number;
  sampleCount: number;
};

/** Compare UTC date vs local calendar date. Does not rewrite stored dates. */
export function timezoneSkewWarning(
  visits: Array<{ start: string; date: string }>,
  timeZone?: string | null,
): TimezoneWarning {
  const tz = timeZone?.trim() || "UTC";
  let skewed = 0;
  let sample = 0;
  for (const v of visits) {
    if (!v.start) continue;
    sample += 1;
    const local = localCalendarDate(v.start, tz);
    if (local && local !== v.date) skewed += 1;
  }
  const skewedShare = sample ? skewed / sample : 0;
  return {
    warn: sample >= 8 && skewedShare >= 0.15,
    skewedShare: Math.round(skewedShare * 1000) / 1000,
    sampleCount: sample,
  };
}

export function localCalendarDate(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return iso.slice(0, 10);
    return `${y}-${m}-${day}`;
  } catch {
    return iso.slice(0, 10);
  }
}

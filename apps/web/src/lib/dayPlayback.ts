import type { Activity, Connector, RouteStep, Visit } from '../types';

export type PlaybackKind = 'visit' | 'activity' | 'unknown';

export interface PlaybackSegment {
  kind: PlaybackKind;
  startMs: number;
  endMs: number;
  path: [number, number][];
  steps?: RouteStep[];
  visit?: Visit;
  activity?: Activity;
  connector?: Connector;
}

export interface PlaybackRange {
  startMs: number;
  endMs: number;
}

export interface PlaybackPosition {
  lat: number;
  lon: number;
  t: number;
  segment: PlaybackSegment | null;
}

/** Calendar date from a stored ISO string (same slice as import `date`). */
export function recordDate(iso: string): string {
  return iso.slice(0, 10);
}

export function startedBeforeDate(startIso: string, date: string): boolean {
  return recordDate(startIso) < date;
}

export function continuesPastDate(endIso: string, date: string): boolean {
  return recordDate(endIso) > date;
}

/** UTC midnight bounds for a `YYYY-MM-DD` calendar date. End is exclusive. */
export function dayUtcBounds(date: string): PlaybackRange {
  const startMs = Date.parse(`${date}T00:00:00.000Z`);
  const parts = date.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const endMs = Date.UTC(y, m - 1, d + 1);
  return { startMs, endMs };
}

function clipInterval(
  startIso: string,
  endIso: string,
  dayStart: number,
  dayEnd: number,
): PlaybackRange | null {
  const rawStart = Date.parse(startIso);
  const rawEnd = Date.parse(endIso);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null;
  const startMs = Math.max(rawStart, dayStart);
  const endMs = Math.min(rawEnd, dayEnd);
  if (!(endMs > startMs)) return null;
  return { startMs, endMs };
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Interpolate along a polyline by distance fraction (0-1). */
export function interpolateAlong(
  points: [number, number][],
  fraction: number,
): { lat: number; lon: number } {
  if (points.length === 0) return { lat: 0, lon: 0 };
  if (points.length === 1 || fraction <= 0) {
    return { lat: points[0][0], lon: points[0][1] };
  }
  const last = points[points.length - 1];
  if (fraction >= 1) return { lat: last[0], lon: last[1] };

  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineM(points[i - 1], points[i]);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return { lat: points[0][0], lon: points[0][1] };

  let remaining = fraction * total;
  for (let i = 0; i < segs.length; i++) {
    const len = segs[i];
    if (remaining <= len || i === segs.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, remaining / len);
      const a = points[i];
      const b = points[i + 1];
      return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t };
    }
    remaining -= len;
  }
  return { lat: last[0], lon: last[1] };
}

function fallbackPath(
  start: [number, number],
  end: [number, number],
  geometry?: [number, number][],
): [number, number][] {
  if (geometry && geometry.length > 0) return geometry;
  return [start, end];
}

function positionOnSegment(segment: PlaybackSegment, t: number): { lat: number; lon: number } {
  const span = Math.max(1, segment.endMs - segment.startMs);
  const frac = Math.min(1, Math.max(0, (t - segment.startMs) / span));

  if (segment.kind === 'visit' || segment.path.length <= 1) {
    const p = segment.path[0];
    return p ? { lat: p[0], lon: p[1] } : { lat: 0, lon: 0 };
  }

  const steps = (segment.steps ?? []).filter(
    (s) => s.geometry && s.geometry.length > 0 && s.duration_seconds > 0,
  );
  const stepTotal = steps.reduce((sum, s) => sum + s.duration_seconds, 0);
  if (steps.length > 0 && stepTotal > 0) {
    let elapsed = frac * stepTotal;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (elapsed <= step.duration_seconds || i === steps.length - 1) {
        const stepFrac = step.duration_seconds === 0 ? 0 : elapsed / step.duration_seconds;
        return interpolateAlong(step.geometry, Math.min(1, Math.max(0, stepFrac)));
      }
      elapsed -= step.duration_seconds;
    }
  }

  return interpolateAlong(segment.path, frac);
}

function endPosition(segment: PlaybackSegment): { lat: number; lon: number } {
  return positionOnSegment(segment, segment.endMs);
}

function startPosition(segment: PlaybackSegment): { lat: number; lon: number } {
  return positionOnSegment(segment, segment.startMs);
}

export function buildPlaybackSegments(
  date: string,
  visits: Visit[],
  activities: Activity[],
  connectors: Connector[] = [],
): PlaybackSegment[] {
  const { startMs: dayStart, endMs: dayEnd } = dayUtcBounds(date);
  const segments: PlaybackSegment[] = [];

  for (const visit of visits) {
    const clipped = clipInterval(visit.start, visit.end, dayStart, dayEnd);
    if (!clipped) continue;
    segments.push({
      kind: 'visit',
      startMs: clipped.startMs,
      endMs: clipped.endMs,
      path: [[visit.lat, visit.lon]],
      visit,
    });
  }

  for (const activity of activities) {
    const clipped = clipInterval(activity.start, activity.end, dayStart, dayEnd);
    if (!clipped) continue;
    segments.push({
      kind: 'activity',
      startMs: clipped.startMs,
      endMs: clipped.endMs,
      path: fallbackPath(
        [activity.start_lat, activity.start_lon],
        [activity.end_lat, activity.end_lon],
        activity.route_geometry,
      ),
      steps: activity.steps,
      activity,
    });
  }

  for (const connector of connectors) {
    const clipped = clipInterval(connector.from_time, connector.to_time, dayStart, dayEnd);
    if (!clipped) continue;
    segments.push({
      kind: 'unknown',
      startMs: clipped.startMs,
      endMs: clipped.endMs,
      path: fallbackPath(
        [connector.from_lat, connector.from_lon],
        [connector.to_lat, connector.to_lon],
        connector.route_geometry,
      ),
      steps: connector.steps,
      connector,
    });
  }

  segments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return segments;
}

export function playbackRange(segments: PlaybackSegment[]): PlaybackRange | null {
  if (segments.length === 0) return null;
  let startMs = segments[0].startMs;
  let endMs = segments[0].endMs;
  for (const s of segments) {
    if (s.startMs < startMs) startMs = s.startMs;
    if (s.endMs > endMs) endMs = s.endMs;
  }
  if (!(endMs > startMs)) return null;
  return { startMs, endMs };
}

export function segmentAt(segments: PlaybackSegment[], t: number): PlaybackSegment | null {
  for (const s of segments) {
    if (t >= s.startMs && t < s.endMs) return s;
  }
  for (const s of segments) {
    if (t === s.endMs) return s;
  }
  return null;
}

export function positionAt(segments: PlaybackSegment[], t: number): PlaybackPosition | null {
  const range = playbackRange(segments);
  if (!range) return null;
  const clamped = Math.min(range.endMs, Math.max(range.startMs, t));

  const containing = segmentAt(segments, clamped);
  if (containing) {
    const pos = positionOnSegment(containing, clamped);
    return { ...pos, t: clamped, segment: containing };
  }

  let previous: PlaybackSegment | null = null;
  for (const s of segments) {
    if (s.endMs <= clamped) previous = s;
    else break;
  }
  if (previous) {
    const pos = endPosition(previous);
    return { ...pos, t: clamped, segment: previous };
  }

  const first = segments[0];
  const pos = startPosition(first);
  return { ...pos, t: clamped, segment: first };
}

export const PLAYBACK_SPEEDS = [10, 30, 60, 120] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 30;

export const UNKNOWN_MOVEMENT_HINT =
  'Timeline did not record a journey here. The dashed path is inferred. You cannot fill this gap in the app yet.';

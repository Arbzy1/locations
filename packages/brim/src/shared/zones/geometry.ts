import type { LatLng } from "../polyline.js";
import { distanceMeters } from "../places.js";
import type { ZoneGeometry } from "./types.js";

type Ring = number[][];
type PolygonRings = Ring[];

function asPolygons(geometry: ZoneGeometry): PolygonRings[] {
  if (geometry.type === "Polygon") return [geometry.coordinates as PolygonRings];
  return geometry.coordinates as PolygonRings[];
}

function pointOnSegment(
  lng: number,
  lat: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  eps = 1e-12,
): boolean {
  const cross = (lng - ax) * (by - ay) - (lat - ay) * (bx - ax);
  if (Math.abs(cross) > eps) return false;
  const dot = (lng - ax) * (bx - ax) + (lat - ay) * (by - ay);
  if (dot < -eps) return false;
  const len = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  if (len <= eps) return false;
  return dot - len <= eps;
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ci = ring[i];
    const cj = ring[j];
    if (!ci || !cj || ci.length < 2 || cj.length < 2) continue;
    const xi = ci[0]!;
    const yi = ci[1]!;
    const xj = cj[0]!;
    const yj = cj[1]!;
    if (xi === xj && yi === yj) continue;
    if (pointOnSegment(lng, lat, xj, yj, xi, yi)) return true;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, geometry: ZoneGeometry): boolean {
  for (const rings of asPolygons(geometry)) {
    const outer = rings[0];
    if (!outer || !pointInRing(lng, lat, outer)) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) {
      const hole = rings[i];
      if (hole && pointInRing(lng, lat, hole)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-18) {
    return (
      pointOnSegment(ax, ay, cx, cy, dx, dy) ||
      pointOnSegment(bx, by, cx, cy, dx, dy) ||
      pointOnSegment(cx, cy, ax, ay, bx, by) ||
      pointOnSegment(dx, dy, ax, ay, bx, by)
    );
  }
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function ringEdges(ring: Ring): Array<[number, number, number, number]> {
  const edges: Array<[number, number, number, number]> = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    edges.push([a[0]!, a[1]!, b[0]!, b[1]!]);
  }
  return edges;
}

export function lineIntersectsPolygon(points: LatLng[], geometry: ZoneGeometry): boolean {
  if (points.some((p) => pointInPolygon(p.lng, p.lat, geometry))) return true;
  const polygons = asPolygons(geometry);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    for (const rings of polygons) {
      for (const ring of rings) {
        for (const [cx, cy, dx, dy] of ringEdges(ring)) {
          if (segmentsIntersect(a.lng, a.lat, b.lng, b.lat, cx, cy, dx, dy)) return true;
        }
      }
    }
  }
  return false;
}

function distPointToSegmentMeters(
  p: LatLng,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const a: LatLng = { lat: ay, lng: ax };
  const b: LatLng = { lat: by, lng: bx };
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return distanceMeters(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)),
  );
  return distanceMeters(p, { lat: a.lat + t * dy, lng: a.lng + t * dx });
}

export function minDistanceMetersToPolygon(points: LatLng[], geometry: ZoneGeometry): number {
  let min = Infinity;
  const polygons = asPolygons(geometry);
  for (const p of points) {
    if (pointInPolygon(p.lng, p.lat, geometry)) return 0;
    for (const rings of polygons) {
      const outer = rings[0];
      if (!outer) continue;
      for (const [cx, cy, dx, dy] of ringEdges(outer)) {
        min = Math.min(min, distPointToSegmentMeters(p, cx, cy, dx, dy));
      }
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    for (const rings of polygons) {
      const outer = rings[0];
      if (!outer) continue;
      for (const [cx, cy, dx, dy] of ringEdges(outer)) {
        min = Math.min(min, distPointToSegmentMeters(a, cx, cy, dx, dy));
        min = Math.min(min, distPointToSegmentMeters(b, cx, cy, dx, dy));
        const mid: LatLng = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
        min = Math.min(min, distPointToSegmentMeters(mid, cx, cy, dx, dy));
      }
    }
  }
  return min;
}

export const NEAR_MISS_METERS = 500;

export function lineNearPolygon(points: LatLng[], geometry: ZoneGeometry, meters = NEAR_MISS_METERS): boolean {
  if (lineIntersectsPolygon(points, geometry)) return false;
  return minDistanceMetersToPolygon(points, geometry) <= meters;
}

function segmentIntersectionT(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number | undefined {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-18) {
    if (pointOnSegment(ax, ay, cx, cy, dx, dy)) return 0;
    if (pointOnSegment(bx, by, cx, cy, dx, dy)) return 1;
    return undefined;
  }
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return undefined;
}

/**
 * Compute fractional distance [0..1] along `points` where the polyline first enters
 * and last exits `geometry`. Returns `undefined` when the polyline does not intersect.
 */
export function linePolygonSpan(
  points: LatLng[],
  geometry: ZoneGeometry,
): { entryFraction: number; exitFraction: number } | undefined {
  if (points.length === 0) return undefined;
  if (points.length === 1) {
    const only = points[0]!;
    return pointInPolygon(only.lng, only.lat, geometry)
      ? { entryFraction: 0, exitFraction: 1 }
      : undefined;
  }

  const segLengths: number[] = [];
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = distanceMeters(points[i]!, points[i + 1]!);
    segLengths.push(len);
    totalMeters += len;
  }

  if (totalMeters <= 0) {
    return points.some((p) => pointInPolygon(p.lng, p.lat, geometry))
      ? { entryFraction: 0, exitFraction: 1 }
      : undefined;
  }

  const polygons = asPolygons(geometry);
  let minMeters = Infinity;
  let maxMeters = -Infinity;
  let cumBefore = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segLen = segLengths[i] ?? 0;

    if (pointInPolygon(a.lng, a.lat, geometry)) {
      minMeters = Math.min(minMeters, cumBefore);
      maxMeters = Math.max(maxMeters, cumBefore);
    }
    if (pointInPolygon(b.lng, b.lat, geometry)) {
      minMeters = Math.min(minMeters, cumBefore + segLen);
      maxMeters = Math.max(maxMeters, cumBefore + segLen);
    }

    for (const rings of polygons) {
      for (const ring of rings) {
        for (const [cx, cy, dx, dy] of ringEdges(ring)) {
          const t = segmentIntersectionT(a.lng, a.lat, b.lng, b.lat, cx, cy, dx, dy);
          if (t !== undefined) {
            const atMeters = cumBefore + t * segLen;
            minMeters = Math.min(minMeters, atMeters);
            maxMeters = Math.max(maxMeters, atMeters);
          }
        }
      }
    }

    cumBefore += segLen;
  }

  if (!Number.isFinite(minMeters) || maxMeters < 0) return undefined;
  const entryFraction = Math.max(0, Math.min(1, minMeters / totalMeters));
  const exitFraction = Math.max(entryFraction, Math.min(1, maxMeters / totalMeters));
  return { entryFraction, exitFraction };
}

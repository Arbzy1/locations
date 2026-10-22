import type { LatLng } from "../polyline.js";
import { distanceMeters } from "../places.js";
import type { FuelGrade, PriceObservation } from "../fuel-finder/types.js";

export function closestPointOnSegment(point: LatLng, a: LatLng, b: LatLng): LatLng {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return a;
  const t = Math.max(
    0,
    Math.min(1, ((point.lng - a.lng) * dx + (point.lat - a.lat) * dy) / (dx * dx + dy * dy)),
  );
  return { lat: a.lat + t * dy, lng: a.lng + t * dx };
}

export function perpendicularMetersToPolyline(point: LatLng, points: LatLng[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    const only = points[0];
    return only ? distanceMeters(point, only) : Infinity;
  }
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const closest = closestPointOnSegment(point, a, b);
    min = Math.min(min, distanceMeters(point, closest));
  }
  return min;
}

export function observationsNearPolyline(
  observations: PriceObservation[],
  points: LatLng[],
  radiusMeters: number,
  grade?: FuelGrade,
): PriceObservation[] {
  const seen = new Set<string>();
  const hits: PriceObservation[] = [];
  for (const row of observations) {
    if (row.isStale) continue;
    if (grade && row.grade !== grade) continue;
    if (seen.has(row.stationId)) continue;
    const perp = perpendicularMetersToPolyline({ lat: row.lat, lng: row.lng }, points);
    if (perp > radiusMeters) continue;
    seen.add(row.stationId);
    hits.push(row);
  }
  return hits;
}

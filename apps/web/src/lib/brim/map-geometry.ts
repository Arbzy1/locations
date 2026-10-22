import { decodePolyline, type LatLng } from "@locations/brim/shared";

export const UK_BOUNDS = {
  west: -8.2,
  south: 49.8,
  east: 1.8,
  north: 58.7,
} as const;

export type LngLatBounds = [[number, number], [number, number]];

export function formatCoordLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function boundsFromPoints(points: LatLng[]): LngLatBounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    north = Math.max(north, p.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

export function ukBounds(): LngLatBounds {
  return [
    [UK_BOUNDS.west, UK_BOUNDS.south],
    [UK_BOUNDS.east, UK_BOUNDS.north],
  ];
}

export function polylinePoints(encoded: string): LatLng[] {
  return decodePolyline(encoded);
}

export function isInUkBox(p: LatLng): boolean {
  return (
    p.lat >= UK_BOUNDS.south &&
    p.lat <= UK_BOUNDS.north &&
    p.lng >= UK_BOUNDS.west &&
    p.lng <= UK_BOUNDS.east
  );
}

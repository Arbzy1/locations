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

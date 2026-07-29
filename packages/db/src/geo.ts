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

export const CLUSTERS: Array<[number, number, number, string]> = [
  // Personal / real geography
  [51.363, -0.272, 5, "SW London (Kingston)"],
  [51.476, -0.2, 4, "South London"],
  [51.51, -0.13, 4, "Central London"],
  [51.36, -0.25, 8, "Surrey/South London"],
  [51.445, -0.354, 5, "Epsom/Sutton"],
  [51.48, 0.01, 5, "SE London/Greenwich"],
  [51.482, -3.179, 8, "Cardiff"],
  [51.66, -3.45, 15, "South Wales"],
  [51.75, -1.26, 10, "Oxford"],
  [52.48, -1.9, 10, "Birmingham"],
  [53.48, -2.24, 10, "Manchester"],
  [55.95, -3.19, 10, "Edinburgh"],
  [43.65, -79.38, 20, "Toronto"],
  [28.96, -13.63, 20, "Lanzarote"],
  [37.39, -5.99, 20, "Seville"],
  [30.42, -9.6, 30, "Morocco (Agadir)"],
  // Demo-only geography (NYC / Boston) — keep separate from personal UK clusters
  [40.708, -73.957, 4, "Williamsburg, Brooklyn"],
  [40.75, -73.98, 3, "Midtown Manhattan"],
  [40.761, -73.978, 2, "Midtown East"],
  [40.758, -73.986, 1.5, "Times Square"],
  [40.779, -73.963, 2, "Central Park"],
  [40.706, -74.009, 2, "Lower Manhattan"],
  [42.355, -71.066, 3, "Boston Common"],
  [42.36, -71.055, 2, "Downtown Boston"],
];

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

export function classifyLocation(lat: number, lon: number): string {
  let bestName = "Other";
  let bestDist = Infinity;
  for (const [clat, clon, radius, name] of CLUSTERS) {
    const dist = haversineKm(lat, lon, clat, clon);
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      bestName = name;
    }
  }
  return bestName;
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

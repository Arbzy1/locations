export type LatLng = { lat: number; lng: number };

const PRECISION = 1e5;

export function encodePolyline(points: LatLng[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  for (const p of points) {
    const lat = Math.round(p.lat * PRECISION);
    const lng = Math.round(p.lng * PRECISION);
    out += encodeSigned(lat - prevLat);
    out += encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

function encodeSigned(value: number): string {
  let s = value < 0 ? ~(value << 1) : value << 1;
  let str = "";
  while (s >= 0x20) {
    str += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  str += String.fromCharCode(s + 63);
  return str;
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const dlat = decodeChunk();
    const dlng = decodeChunk();
    lat += dlat;
    lng += dlng;
    points.push({ lat: lat / PRECISION, lng: lng / PRECISION });
  }
  return points;

  function decodeChunk(): number {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

/** Ramer-Douglas-Peucker. epsilon in degrees. */
export function simplifyRdp(points: LatLng[], epsilon: number): LatLng[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;
  let maxDist = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (!p) continue;
    const d = perpendicularDistance(p, first, last);
    if (d > maxDist) {
      idx = i;
      maxDist = d;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRdp(points.slice(0, idx + 1), epsilon);
    const right = simplifyRdp(points.slice(idx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  const t = Math.max(
    0,
    Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p.lng - (a.lng + t * dx), p.lat - (a.lat + t * dy));
}

/** Parse "51.5074,-0.1278" (lat,lng). */
export function parseLatLngString(value: string): LatLng | undefined {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m?.[1] || !m[2]) return undefined;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function getArrowPoints(
  positions: [number, number][],
  count: number,
): { lat: number; lon: number; angle: number }[] {
  if (positions.length < 2) return [];
  const results: { lat: number; lon: number; angle: number }[] = [];
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const d = Math.sqrt(
      (positions[i][0] - positions[i - 1][0]) ** 2 + (positions[i][1] - positions[i - 1][1]) ** 2,
    );
    segLengths.push(d);
    total += d;
  }
  if (total === 0) return [];
  for (let n = 0; n < count; n++) {
    const target = ((n + 1) / (count + 1)) * total;
    let acc = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (acc + segLengths[i] >= target) {
        const frac = (target - acc) / segLengths[i];
        const lat = positions[i][0] + frac * (positions[i + 1][0] - positions[i][0]);
        const lon = positions[i][1] + frac * (positions[i + 1][1] - positions[i][1]);
        const angle = bearing(positions[i][0], positions[i][1], positions[i + 1][0], positions[i + 1][1]);
        results.push({ lat, lon, angle });
        break;
      }
      acc += segLengths[i];
    }
  }
  return results;
}

export function dashClass(mode: string): string {
  if (mode === 'walking') return 'walk';
  if (mode === 'cycling') return 'cycle';
  if (mode === 'bus') return 'bus';
  if (mode === 'train' || mode === 'subway') return 'rail';
  if (mode === 'flying') return 'fly';
  if (mode === 'unknown') return 'unknown';
  return 'solid';
}

export function toLngLat(lat: number, lon: number): [number, number] {
  return [lon, lat];
}

export function lineCoords(positions: [number, number][]): [number, number][] {
  return positions.map(([lat, lon]) => [lon, lat]);
}

export function extendBounds(
  coords: [number, number][],
): { west: number; south: number; east: number; north: number } | null {
  if (coords.length === 0) return null;
  let west = coords[0][1];
  let east = coords[0][1];
  let south = coords[0][0];
  let north = coords[0][0];
  for (const [lat, lon] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (west === east) {
    west -= 0.01;
    east += 0.01;
  }
  if (south === north) {
    south -= 0.01;
    north += 0.01;
  }
  return { west, south, east, north };
}

/** The point `frac` (0..1) of the way along a [lat, lon] line, or null for an empty line. */
export function pointAlong(positions: [number, number][], frac: number): [number, number] | null {
  if (!positions.length) return null;
  if (positions.length === 1) return positions[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const d = Math.hypot(positions[i][0] - positions[i - 1][0], positions[i][1] - positions[i - 1][1]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return positions[0];
  let target = Math.max(0, Math.min(1, frac)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const t = seg[i] === 0 ? 0 : Math.min(1, target / seg[i]);
      return [
        positions[i][0] + t * (positions[i + 1][0] - positions[i][0]),
        positions[i][1] + t * (positions[i + 1][1] - positions[i][1]),
      ];
    }
    target -= seg[i];
  }
  return positions[positions.length - 1];
}

/** Pixel offsets for a spiral/ring spiderfy around a cluster. */
export function spiderfyOffsets(count: number, radiusPx = 32): { x: number; y: number }[] {
  if (count <= 0) return [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / 8);
    const r = radiusPx + ring * 18;
    const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
    out.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return out;
}

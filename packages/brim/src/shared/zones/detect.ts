import type { LatLng } from "../polyline.js";
import { CHARGE_CATALOGUE } from "./catalogue.js";
import { lineIntersectsPolygon, lineNearPolygon } from "./geometry.js";
import type { ChargeHit, ChargeScheme } from "./types.js";

export function detectHitsFromLine(
  points: LatLng[],
  catalogue: ChargeScheme[] = CHARGE_CATALOGUE,
): ChargeHit[] {
  const hits: ChargeHit[] = [];
  for (const scheme of catalogue) {
    if (lineIntersectsPolygon(points, scheme.geometry)) {
      hits.push({ scheme, relation: "intersects" });
    } else if (lineNearPolygon(points, scheme.geometry)) {
      hits.push({ scheme, relation: "near" });
    }
  }
  return hits;
}

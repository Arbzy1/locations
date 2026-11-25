import type { LatLng } from "../polyline.js";
import { CHARGE_CATALOGUE } from "./catalogue.js";
import { lineIntersectsPolygon, lineNearPolygon, linePolygonSpan } from "./geometry.js";
import type { ChargeHit, ChargeScheme } from "./types.js";

export function detectHitsFromLine(
  points: LatLng[],
  catalogue: ChargeScheme[] = CHARGE_CATALOGUE,
): ChargeHit[] {
  const hits: ChargeHit[] = [];
  for (const scheme of catalogue) {
    if (lineIntersectsPolygon(points, scheme.geometry)) {
      const span = linePolygonSpan(points, scheme.geometry);
      hits.push({
        scheme,
        relation: "intersects",
        ...(span ? { entryFraction: span.entryFraction, exitFraction: span.exitFraction } : {}),
      });
    } else if (lineNearPolygon(points, scheme.geometry)) {
      hits.push({ scheme, relation: "near" });
    }
  }
  return hits;
}

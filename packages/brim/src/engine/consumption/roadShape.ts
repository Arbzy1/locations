import { ROAD_SHAPE, type RoadComposition } from '../../shared/index.js';
import type { ResolvedConsumption } from "./resolve.js";

export type RoadShapeResult = {
  value: number;
  fallbacks: number;
  reasons: string[];
};

export function applyRoadShape(
  resolved: ResolvedConsumption,
  kind: "liquid" | "electric",
  composition: RoadComposition | undefined,
): RoadShapeResult {
  if (!composition) {
    return {
      value: resolved.value,
      fallbacks: 1,
      reasons: ["No road mix available, so we left consumption unadjusted and widened the range."],
    };
  }
  const table = kind === "electric" ? ROAD_SHAPE.ev : ROAD_SHAPE.ice;
  const factor =
    composition.urban * table.urban +
    composition.rural * table.rural +
    composition.motorway * table.motorway;
  return {
    value: resolved.value * factor,
    fallbacks: 0,
    reasons: [],
  };
}

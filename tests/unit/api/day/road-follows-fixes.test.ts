import { describe, expect, it } from "vitest";
import { roadFollowsFixes } from "@locations/api/services";

// Fixes heading east along 51.5N, about 700 m apart.
const fixes = Array.from({ length: 10 }, (_, i) => [51.5, -0.2 + i * 0.01, i * 60] as [number, number, number]);

describe("roadFollowsFixes", () => {
  it("keeps a road line that runs along the GPS fixes", () => {
    const road: [number, number][] = [[51.5002, -0.21], [51.5002, -0.1]];
    expect(roadFollowsFixes(fixes, road)).toBe(true);
  });

  it("rejects a road line that wanders away from them (a train matched to roads)", () => {
    const detour: [number, number][] = [[51.5, -0.2], [51.51, -0.17], [51.51, -0.12], [51.5, -0.11]];
    expect(roadFollowsFixes(fixes, detour)).toBe(false);
  });

  it("accepts any line when there are no fixes to judge it by", () => {
    expect(roadFollowsFixes([], [[51.5, -0.2], [51.5, -0.1]])).toBe(true);
  });
});

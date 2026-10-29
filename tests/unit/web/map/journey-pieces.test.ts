import { describe, expect, it } from "vitest";
import { journeyPieces } from "@locations/web/lib/map/journeyPieces";

// A straight line heading north from 51.50, one vertex every ~111 m (0.001 degrees).
const line: [number, number][] = Array.from({ length: 101 }, (_, i) => [51.5 + i * 0.001, -0.1]);
const fix = (i: number, s: number): [number, number, number] => [line[i][0], line[i][1], s];

describe("journeyPieces", () => {
  it("keeps a steadily recorded journey as one piece", () => {
    const fixes = [0, 20, 40, 60, 80, 100].map((i, k) => fix(i, k * 60));
    expect(journeyPieces(line, fixes, "car")).toEqual([{ kind: "main", coords: line }]);
  });

  it("dashes a stretch with no fixes for over 10 minutes while moving", () => {
    const fixes = [fix(0, 0), fix(20, 60), fix(80, 60 + 900), fix(100, 60 + 960)];
    const pieces = journeyPieces(line, fixes, "train");
    expect(pieces.map((p) => p.kind)).toEqual(["main", "gap", "main"]);
    expect(pieces[1].coords[0]).toEqual(line[20]);
    expect(pieces[1].coords.at(-1)).toEqual(line[80]);
    // Pieces join end to start, so the line has no holes.
    expect(pieces[0].coords.at(-1)).toEqual(pieces[1].coords[0]);
  });

  it("does not dash a long wait in one place", () => {
    const fixes = [fix(0, 0), fix(20, 60), fix(21, 1200), fix(100, 1500)];
    expect(journeyPieces(line, fixes, "train").map((p) => p.kind)).not.toContain("gap");
  });

  it("draws the walk to and from the station at walking pace as walking", () => {
    // ~555 m at ~5 km/h, then a fast ride, then ~555 m at ~5 km/h.
    const fixes = [fix(0, 0), fix(5, 400), fix(10, 800), fix(50, 1000), fix(90, 1200), fix(95, 1600), fix(100, 2000)];
    const kinds = journeyPieces(line, fixes, "train").map((p) => p.kind);
    expect(kinds).toEqual(["walk", "main", "walk"]);
  });

  it("leaves a journey that was slow all the way, or already a walk, alone", () => {
    const slow = [0, 5, 10, 15].map((i, k) => fix(i, k * 400));
    expect(journeyPieces(line, slow, "train").map((p) => p.kind)).toEqual(["main"]);
    // Cars start slowly in traffic and car parks: not a walk.
    const car = [fix(0, 0), fix(5, 400), fix(10, 800), fix(50, 1000), fix(90, 1200)];
    expect(journeyPieces(line, car, "car").map((p) => p.kind)).toEqual(["main"]);
    const walk = [fix(0, 0), fix(5, 400), fix(50, 700), fix(100, 1000)];
    expect(journeyPieces(line, walk, "walking").map((p) => p.kind)).toEqual(["main"]);
  });

  it("copes with missing or tiny inputs", () => {
    expect(journeyPieces(line, undefined, "car")).toEqual([{ kind: "main", coords: line }]);
    expect(journeyPieces([[51.5, -0.1]], [fix(0, 0), fix(1, 60)], "car")).toHaveLength(1);
  });
});

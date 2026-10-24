import { describe, expect, it } from "vitest";
import { journeyColor, modeColorVar } from "@locations/web/lib/map/journeyColors";
import { pointAlong } from "@locations/web/lib/map/mapGeometry";

describe("journeyColor", () => {
  const train = { mode: "train", source_id: "src-1" };

  it("colours by transport mode by default, whatever the source", () => {
    expect(journeyColor(train, 0, 3, "mode", { "src-1": "var(--visit)" })).toBe("var(--mode-train)");
    expect(journeyColor({ mode: "hovercraft" }, 0, 1, "mode")).toBe("var(--mode-unknown)");
  });

  it("colours by journey when asked, with a source colour winning as before", () => {
    expect(journeyColor(train, 0, 3, "journey", { "src-1": "var(--visit)" })).toBe("var(--visit)");
    const first = journeyColor({ mode: "car" }, 0, 3, "journey");
    const last = journeyColor({ mode: "car" }, 2, 3, "journey");
    expect(first).not.toBe(last);
  });

  it("has a token for every mode the app knows", () => {
    for (const mode of ["walking", "cycling", "car", "bus", "train", "subway", "flying"]) {
      expect(modeColorVar(mode)).toBe(`var(--mode-${mode})`);
    }
  });
});

describe("pointAlong", () => {
  const line: [number, number][] = [
    [0, 0],
    [0, 10],
    [10, 10],
  ];

  it("walks the line by length", () => {
    expect(pointAlong(line, 0)).toEqual([0, 0]);
    expect(pointAlong(line, 0.25)).toEqual([0, 5]);
    expect(pointAlong(line, 0.75)).toEqual([5, 10]);
    expect(pointAlong(line, 1)).toEqual([10, 10]);
  });

  it("puts a return trip's badge somewhere else on a shared road", () => {
    const back = [...line].reverse();
    expect(pointAlong(line, 0.4)).not.toEqual(pointAlong(back, 0.4));
  });

  it("copes with empty and single-point lines", () => {
    expect(pointAlong([], 0.5)).toBeNull();
    expect(pointAlong([[1, 2]], 0.5)).toEqual([1, 2]);
  });
});

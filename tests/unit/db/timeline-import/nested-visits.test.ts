import { describe, expect, it } from "vitest";
import { parseTimelineJson } from "@locations/db";

const visit = (start: string, end: string, level: string, lat: number) => ({
  startTime: `2024-06-01T${start}:00.000Z`,
  endTime: `2024-06-01T${end}:00.000Z`,
  visit: {
    hierarchyLevel: level,
    topCandidate: { placeLocation: `geo:${lat},-0.1`, semanticType: "Unknown" },
  },
});

describe("nested Timeline visits", () => {
  it("cuts a parent stay around the stay nested inside it", () => {
    const { visits } = parseTimelineJson([
      visit("10:00", "14:00", "0", 51.5),
      visit("11:00", "11:30", "1", 51.51),
    ]);
    expect(visits.map((v) => [v.start.slice(11, 16), v.end.slice(11, 16), v.lat])).toEqual([
      ["10:00", "11:00", 51.5],
      ["11:00", "11:30", 51.51],
      ["11:30", "14:00", 51.5],
    ]);
    expect(visits.reduce((s, v) => s + v.durationMinutes, 0)).toBe(240);
  });

  it("drops parent slivers shorter than two minutes", () => {
    const { visits } = parseTimelineJson([
      visit("10:00", "11:01", "0", 51.5),
      visit("10:00", "11:00", "1", 51.51),
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0].lat).toBe(51.51);
  });

  it("leaves exports without hierarchy levels alone", () => {
    const { visits } = parseTimelineJson([
      visit("10:00", "11:00", "0", 51.5),
      visit("12:00", "13:00", "0", 51.6),
    ]);
    expect(visits).toHaveLength(2);
  });
});

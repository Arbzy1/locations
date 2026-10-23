import { describe, expect, it } from "vitest";
import { planBatches } from "@locations/web/lib/import/browser-import";

const stay = (i: number) => ({ start: `2024-01-01T00:${String(i % 60).padStart(2, "0")}:00Z`, date: "2024-01-01", note: "x".repeat(200) });
const longTrip = (i: number) => ({ start: `2024-01-02T00:00:${i}Z`, path: Array.from({ length: 300 }, (_, k) => [51 + k / 1e4, -0.1, 1e9 + k]) });

describe("planBatches", () => {
  it("keeps every row, in order, and caps rows per request", () => {
    const visits = Array.from({ length: 600 }, (_, i) => stay(i));
    const batches = planBatches(visits, []);
    expect(batches.flatMap((b) => b.visits)).toEqual(visits);
    expect(Math.max(...batches.map((b) => b.visits.length + b.activities.length))).toBeLessThanOrEqual(250);
  });

  it("caps request size by bytes when GPS paths are long", () => {
    const activities = Array.from({ length: 80 }, (_, i) => longTrip(i));
    const batches = planBatches([], activities);
    for (const b of batches) expect(JSON.stringify(b).length).toBeLessThanOrEqual(130 * 1024);
    expect(batches.flatMap((b) => b.activities)).toHaveLength(80);
  });

  it("never produces an empty batch, even for one oversized row", () => {
    const huge = { start: "2024-01-03T00:00:00Z", blob: "y".repeat(200 * 1024) };
    expect(planBatches([huge], [])).toEqual([{ visits: [huge], activities: [] }]);
    expect(planBatches([], [])).toEqual([]);
  });
});

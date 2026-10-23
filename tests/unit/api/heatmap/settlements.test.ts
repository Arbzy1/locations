import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichHeatmapSettlements } from "@locations/api/services";

function cacheDb(rows: { placeId: string; name: string; address: string; data: unknown }[]) {
  const chain = (result: unknown[]) => {
    const q: Record<string, unknown> = {};
    q.where = () => q;
    q.limit = async () => result;
    q.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject);
    return q;
  };
  return {
    select: () => ({
      from: () => chain(rows),
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: async () => {}, onConflictDoUpdate: async () => {} }),
    }),
  } as never;
}

describe("enrichHeatmapSettlements", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fills settlement names from a batched place_cache read", async () => {
    const points = [
      {
        lat: 51.5,
        lon: -0.1,
        count: 8,
        label: "Near 51.5000, -0.1000",
        cluster: undefined,
        totalDurationMinutes: 10,
        uniqueDays: 2,
        topTypes: ["Home"],
        settlement: null,
      },
    ];
    const key = `settlement:${(51.5).toFixed(5)},${(-0.1).toFixed(5)}`;
    await enrichHeatmapSettlements(
      cacheDb([{ placeId: key, name: "London", address: "", data: {} }]),
      points,
    );
    expect(points[0].settlement).toBe("London");
    expect(points[0].label).toBe("London");
    expect(fetch).not.toHaveBeenCalled();
  });
});

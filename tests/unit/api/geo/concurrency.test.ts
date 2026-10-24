import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapLimit, resolveCoords } from "@locations/api/services";

/** Fake Drizzle with an empty place_cache. */
function emptyCacheDb() {
  const q = { where: () => q, limit: async () => [] as unknown[] };
  return {
    select: () => ({ from: () => q }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined, onConflictDoNothing: async () => undefined }),
    }),
  } as never;
}

describe("mapLimit", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], 2, async (ms, i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight -= 1;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe("Nominatim spacing under concurrency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ name: "Cafe", address: {} }), { status: 200 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends parallel live lookups one slot apart, within the budget", async () => {
    const db = emptyCacheDb();
    const budget = { live: 2 };
    const pending = Promise.all([
      resolveCoords(db, 51.5, -0.1, budget),
      resolveCoords(db, 51.6, -0.1, budget),
      resolveCoords(db, 51.7, -0.1, budget),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    // First call goes straight away; the second waits for its reserved slot.
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1200);
    const names = (await pending).map((r) => r.name);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Budget of two: the third is left unnamed for a later view.
    expect(names.filter((n) => n === "Unknown")).toHaveLength(1);
  });
});

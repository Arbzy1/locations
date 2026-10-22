import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importJobs } from "@locations/db";
import {
  STALE_IMPORT_MS,
  buildDay,
  failStaleImportJobs,
  resolveCoords,
} from "@locations/api/services";

/** Fake Drizzle with an empty place_cache that records inserts. */
function emptyCacheDb() {
  const inserted: unknown[] = [];
  const q = { where: () => q, limit: async () => [] as unknown[] };
  const db = {
    select: () => ({ from: () => q }),
    insert: () => ({
      values: (v: unknown) => {
        inserted.push(v);
        return { onConflictDoUpdate: async () => undefined, onConflictDoNothing: async () => undefined };
      },
    }),
  };
  return { db: db as never, inserted };
}

const nominatimOk = () =>
  new Response(JSON.stringify({ name: "Cafe", display_name: "Cafe, Town", address: {} }), { status: 200 });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => nominatimOk()));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resolveCoords live budget", () => {
  it("stops calling Nominatim once the budget is spent", async () => {
    const { db } = emptyCacheDb();
    const budget = { live: 1 };
    expect((await resolveCoords(db, 51.5, -0.1, budget)).name).toBe("Cafe");
    expect((await resolveCoords(db, 51.6, -0.1, budget)).name).toBe("Unknown");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("spaces live calls to one a second", async () => {
    vi.useFakeTimers();
    const { db } = emptyCacheDb();
    const budget = { live: 2, lastAt: Date.now() };
    const pending = resolveCoords(db, 51.5, -0.1, budget);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is unlimited without a budget (scripts)", async () => {
    const { db } = emptyCacheDb();
    for (let i = 0; i < 3; i++) await resolveCoords(db, 51.5 + i / 10, -0.1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("buildDay", () => {
  it("stops when the client disconnects", async () => {
    const { db } = emptyCacheDb();
    const controller = new AbortController();
    controller.abort();
    const rows = {
      day: { totalDistanceMiles: 0, modes: {}, clusters: [] },
      visits: [],
      activities: [],
    } as never;
    await expect(buildDay(db, "t1", "2024-06-01", rows, undefined, { signal: controller.signal })).rejects.toThrow();
  });
});

describe("failStaleImportJobs", () => {
  it("fails only this tenant's open jobs older than the cutoff", async () => {
    let table: unknown;
    let patch: Record<string, unknown> | undefined;
    let where: unknown;
    const db = {
      update: (t: unknown) => {
        table = t;
        return {
          set: (p: Record<string, unknown>) => {
            patch = p;
            return { where: async (w: unknown) => void (where = w) };
          },
        };
      },
    } as never;
    const now = Date.UTC(2026, 9, 22, 12);
    await failStaleImportJobs(db, "t1", now);
    expect(table).toBe(importJobs);
    expect(patch?.status).toBe("error");
    expect(String(patch?.error)).toMatch(/upload the file again/i);
    expect(where).toBeDefined();
    expect(STALE_IMPORT_MS).toBe(15 * 60_000);
  });
});

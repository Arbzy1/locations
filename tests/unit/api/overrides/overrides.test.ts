import { describe, expect, it } from "vitest";
import { OVERRIDE_MODES, saveTimelineOverride } from "@locations/api/services";

/** Fake Drizzle: the tenant owns one stay and one journey (Google said car); records writes. */
function fakeDb() {
  const writes: { op: string; values?: Record<string, unknown> }[] = [];
  const owned = ["2024-06-01T08:00:00Z"];
  const rows = () => (owned.length ? [{ start: owned[0], mode: "car", googleMode: null }] : []);
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          const found = rows();
          return { limit: async () => found, then: (r: (x: unknown) => unknown) => r(found) };
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({ where: async () => void writes.push({ op: "update", values }) }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => void writes.push({ op: "upsert", values }),
      }),
    }),
    delete: () => ({ where: async () => void writes.push({ op: "delete" }) }),
  };
  return { db: db as never, writes, owned };
}

describe("saveTimelineOverride", () => {
  it("saves a trimmed note and a known mode", async () => {
    const { db, writes } = fakeDb();
    const out = await saveTimelineOverride(db, "t1", {
      kind: "activity",
      start: "2024-06-01T08:00:00Z",
      note: "  Drove Mum to the station  ",
      mode: "train",
    });
    expect(out).toMatchObject({ note: "Drove Mum to the station", mode: "train" });
    const override = writes.find((w) => w.values?.kind === "activity");
    expect(override?.values).toMatchObject({ tenant: "t1", kind: "activity", note: "Drove Mum to the station" });
    // The journey row carries the fix too (so stats and Routes follow it), and stats rebuild.
    expect(writes.find((w) => w.op === "update")?.values).toMatchObject({ mode: "train" });
    expect(writes.some((w) => w.values?.key === "_aggregates_stale")).toBe(true);
  });

  it("leaves the journey row alone when only the note changes", async () => {
    const { db, writes } = fakeDb();
    await saveTimelineOverride(db, "t1", { kind: "activity", start: "2024-06-01T08:00:00Z", note: "hi", mode: null });
    expect(writes.some((w) => w.op === "update")).toBe(false);
  });

  it("clears the row when note and mode are both empty", async () => {
    const { db, writes } = fakeDb();
    await saveTimelineOverride(db, "t1", { kind: "visit", start: "2024-06-01T08:00:00Z", note: " " });
    expect(writes).toEqual([{ op: "delete" }]);
  });

  it("rejects bad input and other tenants' items", async () => {
    const { db, owned } = fakeDb();
    expect(await saveTimelineOverride(db, "t1", { kind: "trip", start: "x" })).toMatchObject({ status: 400 });
    expect(await saveTimelineOverride(db, "t1", { kind: "visit", start: "x", mode: "car" })).toMatchObject({ status: 400 });
    expect(await saveTimelineOverride(db, "t1", { kind: "activity", start: "x", mode: "teleport" })).toMatchObject({ status: 400 });
    owned.length = 0;
    expect(await saveTimelineOverride(db, "t1", { kind: "visit", start: "2024-06-01T08:00:00Z", note: "hi" })).toMatchObject({ status: 404 });
  });

  it("offers the app's own modes, not unknown", () => {
    expect(OVERRIDE_MODES).toContain("walking");
    expect(OVERRIDE_MODES).toContain("car");
    expect(OVERRIDE_MODES).not.toContain("unknown");
  });
});

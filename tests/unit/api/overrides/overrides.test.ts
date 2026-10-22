import { describe, expect, it } from "vitest";
import { OVERRIDE_MODES, saveTimelineOverride } from "@locations/api/services";

/** Fake Drizzle: the tenant owns one stay and one journey; records the override write. */
function fakeDb() {
  const writes: { op: string; values?: Record<string, unknown> }[] = [];
  const owned = ["2024-06-01T08:00:00Z"];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (owned.length ? [{ start: owned[0] }] : []) }),
      }),
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
    expect(writes[0].values).toMatchObject({ tenant: "t1", kind: "activity", note: "Drove Mum to the station" });
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

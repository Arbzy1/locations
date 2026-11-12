import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { discardImportJobRows, finishImportJob, startImportJob } from "@locations/api/import-session";

type Call = { op: string; table: string };

/**
 * Chainable stand-in for the Drizzle client. Every builder method returns the chain;
 * awaiting it yields the next queued result for that operation (default: no rows).
 */
function fakeDb(results: { select?: unknown[][]; update?: unknown[][] } = {}) {
  const calls: Call[] = [];
  const queues = { select: [...(results.select ?? [])], update: [...(results.update ?? [])] };
  const chain = (op: string): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const queue = queues[op as "select" | "update"];
            const value = queue?.length ? queue.shift() : [];
            return (resolve: (v: unknown) => void) => resolve(value);
          }
          return () => chain(op);
        },
      },
    );
  const start = (op: string) => (table?: PgTable) => {
    calls.push({ op, table: table ? getTableName(table) : "" });
    return chain(op);
  };
  const db = {
    select: start("select"),
    selectDistinct: start("select"),
    insert: start("insert"),
    update: start("update"),
    delete: start("delete"),
    execute: async () => ({ rowCount: 0 }),
  };
  const deleted = () => calls.filter((c) => c.op === "delete").map((c) => c.table);
  return { db: db as never, calls, deleted };
}

const tenant = "user-a" as never;
const job = { id: "job-1", sourceId: "src-1" };

describe("startImportJob", () => {
  const opts = {
    userId: "user-a",
    sourceId: "src-1",
    label: "",
    merge: false,
    chosenFile: null,
    parsedCount: 10,
    maxSources: 1,
  };

  it("keeps the source's rows when a replace import starts", async () => {
    // No stale jobs, no active job, then the existing source.
    const { db, deleted } = fakeDb({ select: [[], [{ id: "src-1", label: "Phone" }]] });
    const started = await startImportJob(db, tenant, opts);
    expect(started.status).toBe(200);
    expect(deleted()).toEqual([]);
  });

  it("removes the rows a stale job had uploaded", async () => {
    const { db, deleted } = fakeDb({
      update: [[{ id: "old-job", sourceId: "src-1" }]],
      select: [[], [{ id: "src-1", label: "Phone" }]],
    });
    await startImportJob(db, tenant, opts);
    expect(deleted()).toEqual(["visits", "activities"]);
  });
});

describe("finishImportJob", () => {
  it("swaps out the old rows when a replace import finishes", async () => {
    const { db, deleted } = fakeDb();
    await finishImportJob(db, tenant, { ...job, merge: false, visitCount: 3, activityCount: 2 }, []);
    expect(deleted().slice(0, 2)).toEqual(["visits", "activities"]);
  });

  it("deletes nothing when merging", async () => {
    const { db, deleted } = fakeDb();
    await finishImportJob(db, tenant, { ...job, merge: true, visitCount: 3, activityCount: 2 }, []);
    expect(deleted()).not.toContain("visits");
    expect(deleted()).not.toContain("activities");
  });

  it("does not wipe the source when the job stored nothing", async () => {
    const { db, deleted } = fakeDb();
    await finishImportJob(db, tenant, { ...job, merge: false, visitCount: 0, activityCount: 0 }, []);
    expect(deleted()).not.toContain("visits");
    expect(deleted()).not.toContain("activities");
  });
});

describe("discardImportJobRows", () => {
  it("deletes the job's stays and journeys", async () => {
    const { db, deleted } = fakeDb();
    await discardImportJobRows(db, tenant, job);
    expect(deleted()).toEqual(["visits", "activities"]);
  });
});

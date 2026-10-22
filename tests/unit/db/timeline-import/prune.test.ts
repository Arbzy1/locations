import { describe, expect, it } from "vitest";
import { activities, dataSources, pruneTenantToSource, visits } from "@locations/db";

/** Chainable fake Drizzle: every query resolves to []; deletes record their table. */
function fakeDb() {
  const deleted: unknown[] = [];
  const chain = (): unknown =>
    new Proxy(Promise.resolve([]), {
      get(target, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return (target as unknown as Record<string, unknown>)[prop as string] instanceof Function
            ? ((target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string]).bind(target)
            : undefined;
        }
        return () => chain();
      },
    });
  const db = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "delete") {
          return (table: unknown) => {
            deleted.push(table);
            return chain();
          };
        }
        return () => chain();
      },
    },
  );
  return { db: db as never, deleted };
}

describe("pruneTenantToSource", () => {
  it("deletes other sources' visits, activities and data_sources rows", async () => {
    const { db, deleted } = fakeDb();
    const result = await pruneTenantToSource(db, { tenant: "demo", sourceId: "keep" });
    expect(deleted.slice(0, 3)).toEqual([visits, activities, dataSources]);
    expect(result.days).toBe(0);
  });
});

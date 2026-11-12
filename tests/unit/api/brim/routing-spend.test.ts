import { describe, expect, it } from "vitest";
import { ROUTE_COST_USD, budgetStatus, routingSpendKey } from "@locations/brim/routing";
import { addRoutingSpendUsd, getRoutingSpendUsd } from "@locations/api/brim/db/repo";

/** Drizzle stand-in: select resolves to `rows`; inserts are recorded. */
function fakeDb(rows: { value: string }[] = []) {
  const inserts: { values: Record<string, unknown>; conflict: boolean }[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          inserts.push({ values, conflict: true });
        },
      }),
    }),
  };
  return { handle: { env: {}, db } as never, inserts };
}

describe("routing spend counter", () => {
  it("keys the total by UTC month", () => {
    expect(routingSpendKey(new Date("2026-11-30T23:59:59Z"))).toBe("routing_spend:2026-11");
    expect(routingSpendKey(new Date("2026-12-01T00:00:00Z"))).toBe("routing_spend:2026-12");
  });

  it("reads zero when nothing is recorded or the value is unusable", async () => {
    expect(await getRoutingSpendUsd(fakeDb().handle)).toBe(0);
    expect(await getRoutingSpendUsd(fakeDb([{ value: "not a number" }]).handle)).toBe(0);
    expect(await getRoutingSpendUsd(fakeDb([{ value: "-3" }]).handle)).toBe(0);
  });

  it("reads the recorded total", async () => {
    expect(await getRoutingSpendUsd(fakeDb([{ value: "12.345" }]).handle)).toBe(12.345);
  });

  it("adds a request's cost under this month's key", async () => {
    const { handle, inserts } = fakeDb();
    const now = new Date("2026-11-12T10:00:00Z");
    await addRoutingSpendUsd(handle, ROUTE_COST_USD.advanced, now);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({ key: "routing_spend:2026-11", value: String(ROUTE_COST_USD.advanced) });
  });

  it("writes nothing for a zero cost", async () => {
    const { handle, inserts } = fakeDb();
    await addRoutingSpendUsd(handle, 0);
    expect(inserts).toHaveLength(0);
  });

  it("trips the guard once the recorded total reaches the ceiling", () => {
    const calls = Math.ceil(50 / ROUTE_COST_USD.advanced);
    expect(budgetStatus({ spentUsd: calls * ROUTE_COST_USD.advanced, ceilingUsd: 50 }).exceeded).toBe(true);
    expect(budgetStatus({ spentUsd: ROUTE_COST_USD.basic, ceilingUsd: 50 }).exceeded).toBe(false);
  });
});

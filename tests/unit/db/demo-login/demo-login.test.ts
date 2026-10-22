import { describe, expect, it } from "vitest";
import { account, session, user } from "@locations/db";
import { ensureDemoLogin } from "../../../../packages/db/src/demo-login";

type Op = { op: "insert" | "update" | "delete"; table: unknown; values?: Record<string, unknown> };

/** Fake neon-http Drizzle: select returns `existing`, writes are recorded. */
function fakeDb(existing: Array<Record<string, unknown>>, credentialRows = 1) {
  const ops: Op[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => existing }) }) }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        ops.push({ op: "insert", table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        const run = () => ops.push({ op: "update", table, values });
        const where = () => {
          run();
          return Object.assign(Promise.resolve(), {
            returning: async () => (table === account ? Array.from({ length: credentialRows }, () => ({ id: "a" })) : []),
          });
        };
        return { where };
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        ops.push({ op: "delete", table });
      },
    }),
  };
  return { db: db as never, ops };
}

describe("ensureDemoLogin", () => {
  it("creates a verified demo-role user with a credential account", async () => {
    const { db, ops } = fakeDb([]);
    const result = await ensureDemoLogin(db, { email: " Demo@Locations.app ", passwordHash: "hash-1" });
    expect(result.created).toBe(true);
    const userInsert = ops.find((o) => o.op === "insert" && o.table === user)?.values;
    expect(userInsert).toMatchObject({ email: "demo@locations.app", role: "demo", emailVerified: true });
    const accountInsert = ops.find((o) => o.op === "insert" && o.table === account)?.values;
    expect(accountInsert).toMatchObject({ providerId: "credential", password: "hash-1", userId: result.userId });
  });

  it("resets the password of an existing demo login and drops its sessions", async () => {
    const { db, ops } = fakeDb([{ id: "demo-id", email: "demo@locations.app", role: "demo" }]);
    const result = await ensureDemoLogin(db, { email: "demo@locations.app", passwordHash: "hash-2" });
    expect(result).toEqual({ userId: "demo-id", created: false });
    expect(ops.find((o) => o.op === "update" && o.table === account)?.values).toMatchObject({ password: "hash-2" });
    expect(ops.some((o) => o.op === "delete" && o.table === session)).toBe(true);
    expect(ops.some((o) => o.op === "insert")).toBe(false);
  });

  it("adds a credential account when the demo user has none", async () => {
    const { db, ops } = fakeDb([{ id: "demo-id", email: "demo@locations.app", role: "demo" }], 0);
    await ensureDemoLogin(db, { email: "demo@locations.app", passwordHash: "hash-3" });
    expect(ops.find((o) => o.op === "insert" && o.table === account)?.values).toMatchObject({
      userId: "demo-id",
      password: "hash-3",
    });
  });

  it("refuses to take over a non-demo account", async () => {
    const { db, ops } = fakeDb([{ id: "admin-id", email: "owner@example.com", role: "admin" }]);
    await expect(ensureDemoLogin(db, { email: "owner@example.com", passwordHash: "x" })).rejects.toThrow(/admin account/);
    expect(ops).toEqual([]);
  });
});

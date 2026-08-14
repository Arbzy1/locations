import { describe, expect, it } from "vitest";
import { withTenant } from "./with-tenant.js";

describe("withTenant integration", () => {
  it("runs the callback when the driver has no transaction", async () => {
    const seen: string[] = [];
    const out = await withTenant({} as never, "t1", async (db) => {
      seen.push("ran");
      return db;
    });
    expect(seen).toEqual(["ran"]);
    expect(out).toEqual({});
  });
});

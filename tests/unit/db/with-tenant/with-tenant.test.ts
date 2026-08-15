import { describe, expect, it } from "vitest";
import { withTenant } from "@locations/db";

describe("withTenant", () => {
  it("no-ops when transaction is missing", async () => {
    const result = await withTenant({} as never, "tenant-a", async () => "ok");
    expect(result).toBe("ok");
  });

  it("rejects an empty tenant", async () => {
    await expect(withTenant({} as never, "", async () => 1)).rejects.toThrow(/tenant/);
  });

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

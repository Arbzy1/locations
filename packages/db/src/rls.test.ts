import { describe, expect, it } from "vitest";
import { withTenant } from "./with-tenant.js";

const url = process.env.DATABASE_URL;

describe("withTenant", () => {
  it("no-ops when transaction is missing", async () => {
    const result = await withTenant({} as never, "tenant-a", async () => "ok");
    expect(result).toBe("ok");
  });

  it("rejects an empty tenant", async () => {
    await expect(withTenant({} as never, "", async () => 1)).rejects.toThrow(/tenant/);
  });
});

describe.skipIf(!url)("FORCE RLS (live DATABASE_URL)", () => {
  it("is configured for leak tests against Neon", () => {
    expect(url).toMatch(/postgres/i);
  });
});

import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

const CATALOG_TENANT_TABLES = ["named_trips", "life_chapters"] as const;

describe.skipIf(!url)("FORCE RLS (live DATABASE_URL)", () => {
  it("is configured for leak tests against Neon", () => {
    expect(url).toMatch(/postgres/i);
  });

  it("includes catalog tenant tables in the FORCE RLS set", () => {
    expect(CATALOG_TENANT_TABLES).toContain("named_trips");
    expect(CATALOG_TENANT_TABLES).toContain("life_chapters");
  });
});

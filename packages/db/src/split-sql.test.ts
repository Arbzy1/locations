import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSql } from "./split-sql.js";

const drizzleDir = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

describe("splitSql", () => {
  it("keeps DO $$ blocks as one statement", () => {
    const sql = `DO $$
DECLARE
  t text;
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
END $$;

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
`;
    const parts = splitSql(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^DO \$\$/);
    expect(parts[0]).toContain("t text;");
    expect(parts[0]).toMatch(/END \$\$/);
    expect(parts[1]).toBe("ALTER TABLE visits ENABLE ROW LEVEL SECURITY");
  });

  it("does not split on semicolons inside quotes", () => {
    const parts = splitSql("SELECT 'a;b'; SELECT 1;");
    expect(parts).toEqual(["SELECT 'a;b'", "SELECT 1"]);
  });

  it("ignores -- comments when splitting", () => {
    const parts = splitSql("SELECT 1; -- trailing;\nSELECT 2;");
    expect(parts).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("splits 0004_rls.sql into whole DO blocks plus table policies", () => {
    const body = readFileSync(resolve(drizzleDir, "0004_rls.sql"), "utf8");
    const parts = splitSql(body);
    const doBlocks = parts.filter((s) => s.startsWith("DO $$"));
    expect(doBlocks).toHaveLength(2);
    expect(doBlocks[0]).toContain("FORCE ROW LEVEL SECURITY");
    expect(doBlocks[1]).toContain("locations_app");
    expect(parts.length).toBe(23);
  });
});

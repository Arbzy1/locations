import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("empty GUC fail-closed", () => {
  it("matches no visits when app.tenant is empty and the role cannot bypass RLS", async () => {
    const sql = neon(url!);
    const roleRows = await sql`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    if (Boolean(roleRows[0]?.bypass)) return;
    await sql`SELECT set_config('app.tenant', '', true)`;
    const visits = await sql`SELECT count(*)::int AS n FROM visits`;
    const labels = await sql`SELECT count(*)::int AS n FROM place_labels`;
    expect(Number(visits[0]?.n)).toBe(0);
    expect(Number(labels[0]?.n)).toBe(0);
  });
});

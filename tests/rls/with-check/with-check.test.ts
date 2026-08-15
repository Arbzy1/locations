import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("WITH CHECK rejects cross-tenant inserts", () => {
  it("rejects a place_labels insert whose tenant differs from the GUC", async () => {
    const sql = neon(url!);
    const roleRows = await sql`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    if (Boolean(roleRows[0]?.bypass)) return;
    await sql`SELECT set_config('app.tenant', 'rls-check-a', true)`;
    await expect(
      sql`
        INSERT INTO place_labels (tenant, place_key, label, hidden, favourite)
        VALUES ('rls-check-b', 'probe', 'probe', false, false)
      `,
    ).rejects.toThrow();
  });
});

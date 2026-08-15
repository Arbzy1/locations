import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  prepareRlsAppRole,
  rlsDatabaseUrl,
  rlsSql,
  rlsTransaction,
} from "@tests/helpers/rls-env";

const url = rlsDatabaseUrl();

describe.skipIf(!url)("WITH CHECK rejects cross-tenant inserts", () => {
  it("rejects a place_labels insert whose tenant differs from the GUC", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-check-a-${randomUUID()}`;
    const tenantB = `rls-check-b-${randomUUID()}`;
    const placeKey = `rls-check-${randomUUID()}`;
    await expect(
      rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO place_labels (tenant, place_key, label, hidden, favourite)
          VALUES (${tenantB}, ${placeKey}, 'probe', false, false)
        `,
      ]),
    ).rejects.toThrow(/row-level security policy/i);
  });
});

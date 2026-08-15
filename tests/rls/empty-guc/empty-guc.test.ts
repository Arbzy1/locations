import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  prepareRlsAppRole,
  rlsDatabaseUrl,
  rlsSql,
  rlsTransaction,
} from "@tests/helpers/rls-env";

const url = rlsDatabaseUrl();

describe.skipIf(!url)("empty GUC fail-closed", () => {
  it("matches no rows when app.tenant is empty and the role cannot bypass RLS", async ({
    skip,
  }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenant = `rls-empty-${randomUUID()}`;
    const placeKey = `rls-empty-${randomUUID()}`;
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenant}, true)`,
        sql`
          INSERT INTO place_labels (tenant, place_key, label, hidden, favourite)
          VALUES (${tenant}, ${placeKey}, 'probe', false, false)
        `,
      ]);
      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', '', true)`,
        sql`SELECT count(*)::int AS n FROM place_labels WHERE place_key = ${placeKey}`,
      ]);
      const counts = results[results.length - 1] as { n: number }[];
      expect(Number(counts[0]?.n)).toBe(0);
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenant}, true)`,
        sql`DELETE FROM place_labels WHERE tenant = ${tenant} AND place_key = ${placeKey}`,
      ]);
    }
  });
});

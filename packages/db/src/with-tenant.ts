import { sql } from "drizzle-orm";
import type { Db } from "./index.js";

const TENANT_GUC = "app.tenant";

/** Fail-closed: empty GUC matches no RLS rows. */
export function tenantGucSql(tenant: string) {
  return sql`SELECT set_config(${TENANT_GUC}, ${tenant}, true)`;
}

/**
 * Run `fn` inside a transaction with `app.tenant` set for FORCE RLS.
 * Always keep Drizzle tenant filters as well.
 */
export async function withTenant<T>(
  db: Db,
  tenant: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  if (!tenant) {
    throw new Error("tenant is required for withTenant");
  }
  if (typeof db.transaction !== "function") {
    return fn(db);
  }
  return db.transaction(async (tx) => {
    await tx.execute(tenantGucSql(tenant));
    return fn(tx as unknown as Db);
  });
}

import { withTenant, type Db } from "@locations/db";
import type { BrimDb } from "./types";

export type RlsTx = Db;

export type RlsContext = {
  /** Session tenant (`tenantForUser`). Sets the `app.tenant` GUC for FORCE RLS. */
  tenant?: string;
  /** Shared reference tables (stations, zones, VCA, caches) with `USING (true)` policies. */
  shared?: boolean;
};

export async function withRls<T>(db: BrimDb, ctx: RlsContext, fn: (tx: RlsTx) => Promise<T>): Promise<T> {
  if (ctx.tenant) return withTenant(db.db, ctx.tenant, fn);
  if (ctx.shared) return fn(db.db);
  throw new Error("withRls requires tenant or shared");
}

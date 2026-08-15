import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";

export type DbHttp = ReturnType<typeof createHttpDb>;
export type Db = ReturnType<typeof createDb>;

/** HTTP driver for migrations / one-shot CLI. Does not hold a tenant GUC. */
export function createHttpDb(databaseUrl: string) {
  return drizzleHttp(neon(databaseUrl), { schema });
}

/** Transactional Pool driver for the Worker (`withTenant`). */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzleWs(pool, { schema });
}

export * from "./schema.js";
export * from "./geo.js";
export * from "./analytics.js";
export * from "./activity-guess.js";
export * from "./demo-landmarks.js";
export * from "./timeline-import.js";
export * from "./with-tenant.js";
export * from "./entitlements.js";
export * from "./quotas.js";
export { and, eq, sql, desc, or, ilike, inArray, gte, gt, lte, lt } from "drizzle-orm";

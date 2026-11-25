import type { Context } from "hono";
import { isFixtureMode } from "@locations/brim/shared";
import type { Env } from "../env";
import { getDb } from "../services";
import type { BrimDb } from "./db/types";

export type BrimVariables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: string;
  /** Neon pools opened by the request, closed after the response (index.ts). */
  pools: { end: () => Promise<void> }[];
  /** Shared request-scoped Drizzle handle so multiple calls reuse one Pool. */
  db?: ReturnType<typeof getDb>;
};

export type BrimContext = Context<{ Bindings: Env; Variables: BrimVariables }>;

/**
 * Request-scoped Brim DB handle. Reuses `c.get("db")` when already opened on this
 * request and registers any new Neon Pool on `c.get("pools")` so `index.ts` closes
 * it after the response finishes.
 */
export function requestBrimDb(c: BrimContext): BrimDb {
  const existing = c.get("db");
  if (existing) return { env: c.env, db: existing };
  const db = getDb(c.env);
  const client = (db as { $client?: { end?: () => Promise<void> } } | undefined)?.$client;
  if (client?.end) {
    c.get("pools")?.push(client as { end: () => Promise<void> });
  }
  c.set("db", db);
  return { env: c.env, db };
}

export function createDb(env: Env, c?: BrimContext): BrimDb {
  if (c) return requestBrimDb(c);
  return { env, db: getDb(env) };
}

/** Data tenant from the session middleware (`tenantForUser`). Never from the request. */
export function brimTenant(c: BrimContext): string {
  return c.get("tenant");
}

/** Reference data (stations, zones, VCA, grid) comes from Neon unless fixture mode is on. */
export function persistLive(db: BrimDb): boolean {
  return !isFixtureMode(db.env.BRIM_FIXTURES);
}

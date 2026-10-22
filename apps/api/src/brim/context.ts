import type { Context } from "hono";
import { isFixtureMode } from "@locations/brim/shared";
import type { Env } from "../env";
import { getDb } from "../services";
import type { BrimDb } from "./db/types";

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: string;
};

export type BrimContext = Context<{ Bindings: Env; Variables: Variables }>;

export function createDb(env: Env): BrimDb {
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

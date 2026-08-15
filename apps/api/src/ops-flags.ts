import { eq, opsFlags } from "@locations/db";
import type { Env } from "./env";
import { getDb } from "./services";

export const OPS_FLAG_KEYS = [
  "signup_disabled",
  "landing_enabled",
  "globe_enabled",
  "demo_tour",
] as const;

export type OpsFlagKey = (typeof OPS_FLAG_KEYS)[number];

export const LAST_RECAP_FLAG_KEY = "monthly_recap_last";

export type ResolvedOpsFlags = {
  signupDisabled: boolean;
  landingEnabled: boolean;
  globeEnabled: boolean;
  demoTour: boolean;
};

export type FlagRow = { key: string; value: string };

const TTL_MS = 5_000;
let rowCache: { at: number; rows: FlagRow[] } | null = null;

export function isOpsFlagKey(key: string): key is OpsFlagKey {
  return (OPS_FLAG_KEYS as readonly string[]).includes(key);
}

export function parseFlagBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function flagsFromEnv(env: Pick<Env, "DISABLE_SIGNUP" | "LANDING_ENABLED" | "GLOBE_ENABLED" | "DEMO_TOUR">): ResolvedOpsFlags {
  return {
    signupDisabled: env.DISABLE_SIGNUP === "true",
    landingEnabled: env.LANDING_ENABLED !== "false",
    globeEnabled: env.GLOBE_ENABLED !== "false",
    demoTour: env.DEMO_TOUR !== "false",
  };
}

export function mergeFlags(envFlags: ResolvedOpsFlags, rows: FlagRow[]): ResolvedOpsFlags {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    signupDisabled: parseFlagBool(byKey.get("signup_disabled"), envFlags.signupDisabled),
    landingEnabled: parseFlagBool(byKey.get("landing_enabled"), envFlags.landingEnabled),
    globeEnabled: parseFlagBool(byKey.get("globe_enabled"), envFlags.globeEnabled),
    demoTour: parseFlagBool(byKey.get("demo_tour"), envFlags.demoTour),
  };
}

export function clearOpsFlagCache(): void {
  rowCache = null;
}

function dbQueryable(db: unknown): db is { select: (...args: never[]) => unknown } {
  return typeof (db as { select?: unknown })?.select === "function";
}

export async function loadFlagRows(env: Env): Promise<FlagRow[]> {
  const db = getDb(env);
  if (!dbQueryable(db)) return [];
  const rows = await db.select({ key: opsFlags.key, value: opsFlags.value }).from(opsFlags);
  return rows.map((r) => ({ key: r.key, value: r.value }));
}

export async function resolveOpsFlags(env: Env, now = Date.now()): Promise<ResolvedOpsFlags> {
  const envFlags = flagsFromEnv(env);
  try {
    if (!rowCache || now - rowCache.at >= TTL_MS) {
      const rows = await loadFlagRows(env);
      rowCache = { at: now, rows };
    }
    return mergeFlags(envFlags, rowCache.rows);
  } catch {
    return envFlags;
  }
}

export async function listToggleFlags(env: Env): Promise<{
  flags: ResolvedOpsFlags;
  overlay: Record<OpsFlagKey, string | null>;
  source: Record<OpsFlagKey, "db" | "env">;
}> {
  const envFlags = flagsFromEnv(env);
  let rows: FlagRow[] = [];
  try {
    rows = await loadFlagRows(env);
  } catch {
    rows = [];
  }
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const overlay = {
    signup_disabled: byKey.get("signup_disabled") ?? null,
    landing_enabled: byKey.get("landing_enabled") ?? null,
    globe_enabled: byKey.get("globe_enabled") ?? null,
    demo_tour: byKey.get("demo_tour") ?? null,
  };
  const source: Record<OpsFlagKey, "db" | "env"> = {
    signup_disabled: overlay.signup_disabled !== null ? "db" : "env",
    landing_enabled: overlay.landing_enabled !== null ? "db" : "env",
    globe_enabled: overlay.globe_enabled !== null ? "db" : "env",
    demo_tour: overlay.demo_tour !== null ? "db" : "env",
  };
  return { flags: mergeFlags(envFlags, rows), overlay, source };
}

export async function upsertOpsFlag(
  env: Env,
  key: OpsFlagKey,
  value: "true" | "false",
  updatedBy: string,
): Promise<void> {
  const db = getDb(env);
  if (!dbQueryable(db)) return;
  await db
    .insert(opsFlags)
    .values({ key, value, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: opsFlags.key,
      set: { value, updatedAt: new Date(), updatedBy },
    });
  clearOpsFlagCache();
}

export async function readInternalFlag(env: Env, key: string): Promise<string | null> {
  const db = getDb(env);
  if (!dbQueryable(db)) return null;
  const rows = await db
    .select({ value: opsFlags.value })
    .from(opsFlags)
    .where(eq(opsFlags.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function writeInternalFlag(env: Env, key: string, value: string): Promise<void> {
  const db = getDb(env);
  if (!dbQueryable(db)) return;
  await db
    .insert(opsFlags)
    .values({ key, value, updatedAt: new Date(), updatedBy: "system" })
    .onConflictDoUpdate({
      target: opsFlags.key,
      set: { value, updatedAt: new Date(), updatedBy: "system" },
    });
}

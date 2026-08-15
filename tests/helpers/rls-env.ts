import { neon } from "@neondatabase/serverless";
import { loadEnvFiles } from "../../packages/db/src/load-env.ts";

/** Same `.env` / `.dev.vars` load as `db:migrate`. Does not override an existing `DATABASE_URL`. */
loadEnvFiles();

export function rlsDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function rlsSql() {
  const url = rlsDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is required for RLS tests");
  return neon(url);
}

type NeonSql = ReturnType<typeof neon>;
type NeonQuery = ReturnType<NeonSql>;
type AppRoleMode = "direct" | "set-role" | "unavailable";

let appRoleMode: AppRoleMode | null = null;

/**
 * Leak tests must run as a NOBYPASSRLS role. Local `.env` is often `neondb_owner`
 * (BYPASSRLS). If `locations_app` exists, GRANT + SET LOCAL ROLE so FORCE RLS applies.
 */
export async function prepareRlsAppRole(sql: NeonSql): Promise<AppRoleMode> {
  if (appRoleMode) return appRoleMode;
  const me = await sql`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  if (!Boolean(me[0]?.bypass)) {
    appRoleMode = "direct";
    return appRoleMode;
  }
  const exists = await sql`
    SELECT 1 AS ok FROM pg_roles WHERE rolname = 'locations_app' AND NOT rolbypassrls
  `;
  if (!exists.length) {
    appRoleMode = "unavailable";
    return appRoleMode;
  }
  try {
    await sql`GRANT locations_app TO CURRENT_USER`;
    await sql`GRANT USAGE ON SCHEMA public TO locations_app`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE place_labels TO locations_app`;
    try {
      await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE named_trips TO locations_app`;
    } catch {
      /* older DBs may lack this GRANT until 0012+ is applied */
    }
    appRoleMode = "set-role";
    return appRoleMode;
  } catch {
    appRoleMode = "unavailable";
    return appRoleMode;
  }
}

export async function rlsTransaction(sql: NeonSql, queries: NeonQuery[]) {
  const mode = await prepareRlsAppRole(sql);
  if (mode === "unavailable") {
    throw new Error("NOBYPASSRLS role is unavailable for RLS leak tests");
  }
  if (mode === "set-role") {
    return sql.transaction([sql`SET LOCAL ROLE locations_app`, ...queries]);
  }
  return sql.transaction(queries);
}

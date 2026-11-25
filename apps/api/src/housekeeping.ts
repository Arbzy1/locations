import {
  and,
  brimGridIntensity,
  brimRouteCache,
  eq,
  exportJobs,
  importJobs,
  lt,
  or,
  session,
  tenantForUser,
  user,
  verification,
  withTenant,
} from "@locations/db";
import type { Env } from "./env";
import { discardImportJobRows } from "./import-session";
import { notifyImportJob } from "./import-notify";
import { closeDb, getDb } from "./services";

const READY_EXPORT_TTL_MS = 24 * 60 * 60_000;
const STUCK_JOB_TTL_MS = 15 * 60_000;
const GRID_INTENSITY_RETENTION_MS = 90 * 24 * 60 * 60_000;

function dbQueryable(db: unknown): db is ReturnType<typeof getDb> {
  return typeof (db as { select?: unknown; delete?: unknown })?.select === "function";
}

export type HousekeepingSummary = {
  expiredExports: number;
  failedExports: number;
  failedImports: number;
};

/**
 * 20-minute cron sweep:
 * - Expire `ready` `export_jobs` older than 24h (delete R2 zip, set status="expired", r2Key=null).
 * - Fail stuck `pending`/`processing` `export_jobs` and `import_jobs` older than 15m
 *   (delete uncommitted `visits`/`activities` matching failed `importJobId`, notify user).
 * - Purge expired rows from `session`, `verification`, `brim_route_cache`, and `brim_grid_intensity` (>90d).
 */
export async function runHousekeeping(env: Env, now = new Date()): Promise<HousekeepingSummary> {
  const db = getDb(env);
  if (!dbQueryable(db)) {
    await closeDb(db);
    return { expiredExports: 0, failedExports: 0, failedImports: 0 };
  }

  let expiredExports = 0;
  let failedExports = 0;
  let failedImports = 0;

  const readyExportCutoff = new Date(now.getTime() - READY_EXPORT_TTL_MS);
  const stuckCutoff = new Date(now.getTime() - STUCK_JOB_TTL_MS);
  const gridCutoff = new Date(now.getTime() - GRID_INTENSITY_RETENTION_MS);

  try {
    const users = await db.select({ id: user.id, role: user.role }).from(user);
    const seenTenants = new Set<string>();

    for (const u of users) {
      const tenant = tenantForUser({ id: u.id, role: u.role });
      if (!tenant || tenant === "demo" || seenTenants.has(tenant)) continue;
      seenTenants.add(tenant);

      const swept = await withTenant(db, tenant, async (tx) => {
        const oldReady = await tx
          .select({ id: exportJobs.id, r2Key: exportJobs.r2Key })
          .from(exportJobs)
          .where(
            and(
              eq(exportJobs.tenant, tenant),
              eq(exportJobs.status, "ready"),
              lt(exportJobs.updatedAt, readyExportCutoff),
            ),
          );
        if (oldReady.length > 0) {
          await tx
            .update(exportJobs)
            .set({ status: "expired", r2Key: null, updatedAt: now })
            .where(
              and(
                eq(exportJobs.tenant, tenant),
                eq(exportJobs.status, "ready"),
                lt(exportJobs.updatedAt, readyExportCutoff),
              ),
            );
        }

        const stuckExports = await tx
          .select({ id: exportJobs.id, r2Key: exportJobs.r2Key })
          .from(exportJobs)
          .where(
            and(
              eq(exportJobs.tenant, tenant),
              or(eq(exportJobs.status, "pending"), eq(exportJobs.status, "processing")),
              lt(exportJobs.updatedAt, stuckCutoff),
            ),
          );
        if (stuckExports.length > 0) {
          await tx
            .update(exportJobs)
            .set({ status: "error", error: "Export timed out", r2Key: null, updatedAt: now })
            .where(
              and(
                eq(exportJobs.tenant, tenant),
                or(eq(exportJobs.status, "pending"), eq(exportJobs.status, "processing")),
                lt(exportJobs.updatedAt, stuckCutoff),
              ),
            );
        }

        const stuckImports = await tx
          .update(importJobs)
          .set({
            status: "error",
            error: "Import stopped without finishing. Upload the file again.",
            updatedAt: now,
          })
          .where(
            and(
              eq(importJobs.tenant, tenant),
              or(eq(importJobs.status, "pending"), eq(importJobs.status, "processing")),
              lt(importJobs.updatedAt, stuckCutoff),
            ),
          )
          .returning({
            id: importJobs.id,
            sourceId: importJobs.sourceId,
            r2Key: importJobs.r2Key,
          });

        for (const job of stuckImports) {
          await discardImportJobRows(tx, tenant, { id: job.id, sourceId: job.sourceId });
        }

        return { oldReady, stuckExports, stuckImports };
      });

      expiredExports += swept.oldReady.length;
      failedExports += swept.stuckExports.length;
      failedImports += swept.stuckImports.length;

      if (env.UPLOADS) {
        const r2Keys = [
          ...swept.oldReady.map((j) => j.r2Key),
          ...swept.stuckExports.map((j) => j.r2Key),
          ...swept.stuckImports.map((j) => j.r2Key),
        ].filter((k): k is string => Boolean(k));
        for (const key of r2Keys) {
          await env.UPLOADS.delete(key).catch(() => undefined);
        }
      }

      for (const job of swept.stuckImports) {
        await notifyImportJob(env, tenant, job.id, db).catch(() => undefined);
      }
    }

    await db.delete(session).where(lt(session.expiresAt, now));
    await db.delete(verification).where(lt(verification.expiresAt, now));
    await db.delete(brimRouteCache).where(lt(brimRouteCache.expiresAt, now));
    await db.delete(brimGridIntensity).where(lt(brimGridIntensity.validFrom, gridCutoff));
  } finally {
    await closeDb(db);
  }

  return { expiredExports, failedExports, failedImports };
}

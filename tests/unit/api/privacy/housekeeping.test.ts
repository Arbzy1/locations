import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { testEnv } from "@tests/helpers/env";

const { closeDb, updateExportJob, getExportJob, getAccountExportPayload, getImportJob, emailForTenant } = vi.hoisted(
  () => ({
    closeDb: vi.fn(async () => undefined),
    updateExportJob: vi.fn(async () => undefined),
    getExportJob: vi.fn(),
    getAccountExportPayload: vi.fn(),
    getImportJob: vi.fn(),
    emailForTenant: vi.fn(async () => ({ email: "a@example.com", role: "user" })),
  }),
);

let currentDb: unknown = {};

vi.mock("@locations/api/services", () => ({
  getDb: () => currentDb,
  closeDb: (...args: unknown[]) => closeDb(...args),
  updateExportJob: (...args: unknown[]) => updateExportJob(...args),
  getExportJob: (...args: unknown[]) => getExportJob(...args),
  getAccountExportPayload: (...args: unknown[]) => getAccountExportPayload(...args),
  listVisitExportPage: vi.fn(async () => []),
  listActivityExportPage: vi.fn(async () => []),
  getImportJob: (...args: unknown[]) => getImportJob(...args),
  updateImportJob: vi.fn(async () => undefined),
  emailForTenant: (...args: unknown[]) => emailForTenant(...args),
}));

import { runExportPackJob } from "@locations/api/export-pack-job";
import { runHousekeeping } from "@locations/api/housekeeping";

describe("runExportPackJob error scrubbing & pool cleanup", () => {
  it("never persists raw DB exception messages in export_jobs.error and closes db", async () => {
    currentDb = {};
    closeDb.mockClear();
    updateExportJob.mockClear();
    getExportJob.mockResolvedValue({ id: "exp-1", tenant: "user-a", status: "processing" });
    getAccountExportPayload.mockRejectedValue(new Error("Postgres error near (51.5074, -0.1278) Home Place"));

    const env = testEnv();
    await runExportPackJob(env, {
      kind: "export_pack",
      jobId: "exp-1",
      tenant: "user-a",
      userId: "user-a",
      r2Key: "exports/user-a/exp-1.zip",
    });

    const errCall = updateExportJob.mock.calls.find(
      (c) => (c[3] as { status?: string })?.status === "error",
    );
    expect(errCall).toBeDefined();
    expect(errCall?.[3]).toEqual({ status: "error", error: "Export failed" });
    expect(JSON.stringify(updateExportJob.mock.calls)).not.toContain("51.5074");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("exports/user-a/exp-1.zip");
    expect(closeDb).toHaveBeenCalledTimes(1);
  });
});

describe("runHousekeeping", () => {
  it("expires 24h ready exports, fails 15m stuck jobs, purges TTL tables, and closes db", async () => {
    closeDb.mockClear();
    getImportJob.mockResolvedValue({
      id: "imp-stuck",
      status: "error",
      notifiedAt: null,
      visitCount: 0,
      activityCount: 0,
    });

    const deletedTables: string[] = [];
    const updatedTables: Array<{ table: string; values: unknown }> = [];
    let exportSelectCall = 0;

    currentDb = {
      select: () => ({
        from: (table: PgTable) => {
          const name = getTableName(table);
          if (name === "user") {
            return Promise.resolve([{ id: "user-a", role: "user" }]);
          }
          return {
            where: async () => {
              if (name === "export_jobs") {
                exportSelectCall += 1;
                if (exportSelectCall === 1) {
                  return [{ id: "exp-old", r2Key: "exports/user-a/exp-old.zip" }];
                }
                return [{ id: "exp-stuck", r2Key: "exports/user-a/exp-stuck.zip" }];
              }
              return [];
            },
          };
        },
      }),
      update: (table: PgTable) => {
        const name = getTableName(table);
        return {
          set: (values: unknown) => {
            updatedTables.push({ table: name, values });
            return {
              where: () => {
                const res =
                  name === "import_jobs"
                    ? [{ id: "imp-stuck", sourceId: "src-1", r2Key: "uploads/user-a/imp-stuck.json" }]
                    : [];
                const p = Promise.resolve(res);
                return Object.assign(p, {
                  returning: async () => res,
                });
              },
            };
          },
        };
      },
      delete: (table: PgTable) => {
        deletedTables.push(getTableName(table));
        return { where: async () => undefined };
      },
    };

    const env = testEnv();
    const summary = await runHousekeeping(env, new Date("2026-08-20T08:00:00Z"));
    expect(summary).toEqual({
      expiredExports: 1,
      failedExports: 1,
      failedImports: 1,
    });
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("exports/user-a/exp-old.zip");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("exports/user-a/exp-stuck.zip");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/imp-stuck.json");
    expect(deletedTables).toEqual(
      expect.arrayContaining([
        "visits",
        "activities",
        "session",
        "verification",
        "brim_route_cache",
        "brim_grid_intensity",
      ]),
    );
    expect(updatedTables.some((u) => u.table === "export_jobs" && (u.values as { status?: string }).status === "expired")).toBe(true);
    expect(closeDb).toHaveBeenCalledTimes(1);
  });
});

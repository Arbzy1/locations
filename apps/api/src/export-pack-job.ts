import { withTenant } from "@locations/db";
import type { Env } from "./env";
import { buildGdprPackZip, type ExportAccountPayload } from "./export-pack";
import {
  getAccountExportPayload,
  getDb,
  getExportJob,
  listActivityExportPage,
  listVisitExportPage,
  updateExportJob,
} from "./services";

export type ExportPackMessage = {
  jobId: string;
  tenant: string;
  userId: string;
  r2Key: string;
};

async function loadAllPages<T extends { id: number }>(
  load: (afterId: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let afterId = 0;
  for (;;) {
    const page = await load(afterId);
    if (page.length === 0) break;
    rows.push(...page);
    afterId = page[page.length - 1].id;
    if (page.length < 1000) break;
  }
  return rows;
}

export async function runExportPackJob(env: Env, message: ExportPackMessage): Promise<void> {
  const db = getDb(env);
  const { jobId, tenant, r2Key } = message;
  try {
    await withTenant(db, tenant, (tx) =>
      updateExportJob(tx, jobId, tenant, { status: "processing" }),
    );
    const existing = await withTenant(db, tenant, (tx) => getExportJob(tx, jobId, tenant));
    if (!existing) throw new Error("Export job missing");

    const payloadCore = await withTenant(db, tenant, (tx) => getAccountExportPayload(tx, tenant));
    const visits = await withTenant(db, tenant, (tx) =>
      loadAllPages((afterId) => listVisitExportPage(tx, tenant, afterId)),
    );
    const activities = await withTenant(db, tenant, (tx) =>
      loadAllPages((afterId) => listActivityExportPage(tx, tenant, afterId)),
    );

    const account: ExportAccountPayload = {
      tenant,
      exportedAt: new Date().toISOString(),
      ...payloadCore,
    };
    const zip = buildGdprPackZip({ account, visits, activities });
    await env.UPLOADS.put(r2Key, zip, {
      httpMetadata: { contentType: "application/zip" },
    });
    await withTenant(db, tenant, (tx) =>
      updateExportJob(tx, jobId, tenant, {
        status: "ready",
        error: null,
        visitCount: visits.length,
        activityCount: activities.length,
      }),
    );
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "Export failed";
    await withTenant(db, tenant, (tx) =>
      updateExportJob(tx, jobId, tenant, { status: "error", error: messageText }),
    ).catch(() => undefined);
    try {
      await env.UPLOADS.delete(r2Key);
    } catch {
      /* ignore missing object */
    }
  }
}

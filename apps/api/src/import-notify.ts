import { withTenant } from "@locations/db";
import type { Env } from "./env";
import { sendProductEmail } from "./email";
import { closeDb, emailForTenant, getDb, getImportJob, updateImportJob } from "./services";

export async function notifyImportJob(
  env: Env,
  tenant: string,
  jobId: string,
  existingDb?: ReturnType<typeof getDb>,
): Promise<void> {
  const db = existingDb ?? getDb(env);
  try {
    const job = await withTenant(db, tenant, (tx) => getImportJob(tx, jobId, tenant));
    if (!job || job.notifiedAt) return;
    if (job.status !== "ready" && job.status !== "error") return;
    const recipient = await emailForTenant(db, tenant);
    const kind = job.status === "ready" ? "import_ready" : "import_failed";
    const result = recipient
      ? await sendProductEmail(env, {
          kind,
          to: recipient.email,
          role: recipient.role,
          vars:
            job.status === "ready"
              ? { visitCount: job.visitCount ?? 0, activityCount: job.activityCount ?? 0 }
              : {},
          idempotencyKey: `import:${jobId}`,
        })
      : "skipped";
    if (result !== "failed") {
      await withTenant(db, tenant, (tx) =>
        updateImportJob(tx, jobId, { notifiedAt: new Date() }, tenant),
      );
    }
  } finally {
    if (!existingDb) {
      await closeDb(db);
    }
  }
}

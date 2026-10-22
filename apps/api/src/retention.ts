import { tenantForUser, user, withTenant } from "@locations/db";
import type { Env } from "./env";
import { applyRetention, getDb, getUserSettings } from "./services";

/**
 * Monthly cron: for every account that chose to keep only the last N years, delete
 * older history. Logs counts only, never dates or places.
 */
export async function runRetention(env: Env, now = new Date()): Promise<{ trimmed: number }> {
  const db = getDb(env);
  let trimmed = 0;
  try {
    const users = await db.select({ id: user.id, role: user.role }).from(user);
    for (const u of users) {
      if (u.role === "demo") continue;
      const tenant = tenantForUser({ id: u.id, role: u.role });
      if (!tenant || tenant === "demo") continue;
      const removed = await withTenant(db, tenant, async (tx) => {
        const settings = await getUserSettings(tx, tenant);
        if (!settings.retentionYears) return 0;
        const result = await applyRetention(tx, tenant, settings.retentionYears, now);
        return result.visitCount + result.activityCount;
      });
      if (removed > 0) trimmed += 1;
    }
  } finally {
    await (db as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
  }
  console.log(JSON.stringify({ kind: "retention", accountsTrimmed: trimmed }));
  return { trimmed };
}

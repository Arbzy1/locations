import {
  METERS_TO_MILES,
  activities,
  and,
  eq,
  gte,
  lte,
  sql,
  tenantForUser,
  user,
  visits,
  withTenant,
} from "@locations/db";
import type { Env } from "./env";
import { closeDb, getAnalytics, getDb, getUserSettings, upsertUserSettings } from "./services";
import { aggregatesStale } from "./import-session";
import { sendProductEmail } from "./email";
import { LAST_RECAP_FLAG_KEY, writeInternalFlag } from "./ops-flags";

export function lastCompleteMonthYm(now = new Date()): string {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shouldSendMonthlyRecap(opts: {
  enabled: boolean;
  lastYm: string | null | undefined;
  role: string | null | undefined;
  monthYm: string;
}): boolean {
  if (opts.role === "demo") return false;
  if (!opts.enabled) return false;
  if (opts.lastYm === opts.monthYm) return false;
  return true;
}

export type MonthlyRecapVars = {
  daysTracked: number;
  visitCount: number;
  activityCount: number;
  distanceLabel: string;
  monthLabel: string;
};

export function recapVarsFromMonthly(
  monthly: unknown,
  ym: string,
  unit: "mi" | "km",
): MonthlyRecapVars | null {
  if (!Array.isArray(monthly)) return null;
  const row = monthly.find((item) => item && typeof item === "object" && (item as { month?: string }).month === ym) as
    | {
        days_tracked?: number;
        visits?: number;
        activities?: number;
        distance_miles?: number;
      }
    | undefined;
  if (!row) return null;
  const miles = Number(row.distance_miles ?? 0);
  const km = miles / 0.621371;
  const distanceLabel = unit === "km" ? `${Math.round(km)} km` : `${Math.round(miles)} mi`;
  return {
    daysTracked: Number(row.days_tracked ?? 0),
    visitCount: Number(row.visits ?? 0),
    activityCount: Number(row.activities ?? 0),
    distanceLabel,
    monthLabel: monthLabelFromYm(ym),
  };
}

export async function queryMonthlyRecapFallback(
  db: ReturnType<typeof getDb>,
  tenant: string,
  ym: string,
  unit: "mi" | "km",
): Promise<MonthlyRecapVars | null> {
  const from = `${ym}-01`;
  const to = `${ym}-31`;
  const [vRow] = await db
    .select({
      visits: sql<number>`count(*)::int`,
      vDays: sql<string[]>`coalesce(array_agg(distinct ${visits.date}), '{}')`,
    })
    .from(visits)
    .where(and(eq(visits.tenant, tenant), gte(visits.date, from), lte(visits.date, to)));
  const [aRow] = await db
    .select({
      activities: sql<number>`count(*)::int`,
      meters: sql<number>`coalesce(sum(${activities.distanceMeters}), 0)::float8`,
      aDays: sql<string[]>`coalesce(array_agg(distinct ${activities.date}), '{}')`,
    })
    .from(activities)
    .where(and(eq(activities.tenant, tenant), gte(activities.date, from), lte(activities.date, to)));

  const visitCount = Number(vRow?.visits ?? 0);
  const activityCount = Number(aRow?.activities ?? 0);
  if (visitCount === 0 && activityCount === 0) return null;

  const days = new Set<string>([...(vRow?.vDays ?? []), ...(aRow?.aDays ?? [])]);
  const meters = Number(aRow?.meters ?? 0);
  const miles = meters * METERS_TO_MILES;
  const km = meters / 1000;
  const distanceLabel = unit === "km" ? `${Math.round(km)} km` : `${Math.round(miles)} mi`;
  return {
    daysTracked: days.size,
    visitCount,
    activityCount,
    distanceLabel,
    monthLabel: monthLabelFromYm(ym),
  };
}

export async function runMonthlyRecaps(env: Env, now = new Date()): Promise<{ considered: number; sent: number }> {
  const monthYm = lastCompleteMonthYm(now);
  const db = getDb(env);
  let considered = 0;
  let sent = 0;
  try {
    const users = await db
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user);
    for (const u of users) {
      if (!u.email || u.role === "demo") continue;
      const tenant = tenantForUser({ id: u.id, role: u.role });
      if (!tenant || tenant === "demo") continue;
      considered += 1;
      const prepared = await withTenant(db, tenant, async (tx) => {
        const settings = await getUserSettings(tx, tenant);
        if (
          !shouldSendMonthlyRecap({
            enabled: Boolean(settings.monthlyRecapEnabled),
            lastYm: settings.monthlyRecapLastYm,
            role: u.role,
            monthYm,
          })
        ) {
          return null;
        }
        const unit = settings.distanceUnit === "km" ? "km" : "mi";
        const stale = await aggregatesStale(tx, tenant);
        let vars = !stale
          ? recapVarsFromMonthly(await getAnalytics(tx, tenant, "monthly"), monthYm, unit)
          : null;
        if (!vars) {
          vars = await queryMonthlyRecapFallback(tx, tenant, monthYm, unit);
        }
        return { vars };
      });
      if (!prepared) continue;
      if (!prepared.vars) {
        await withTenant(db, tenant, (tx) =>
          upsertUserSettings(tx, tenant, { monthlyRecapLastYm: monthYm }),
        );
        continue;
      }
      const outcome = await sendProductEmail(env, {
        kind: "monthly_recap",
        to: u.email,
        role: u.role,
        vars: prepared.vars,
        idempotencyKey: `monthly_recap:${u.id}:${monthYm}`,
      });
      if (outcome === "sent") {
        await withTenant(db, tenant, (tx) =>
          upsertUserSettings(tx, tenant, { monthlyRecapLastYm: monthYm }),
        );
        sent += 1;
      }
    }
  } finally {
    await closeDb(db);
  }
  await writeInternalFlag(
    env,
    LAST_RECAP_FLAG_KEY,
    JSON.stringify({ considered, sent, at: now.toISOString() }),
  ).catch(() => undefined);
  return { considered, sent };
}

import { user, tenantForUser, withTenant } from "@locations/db";
import type { Env } from "./env";
import { getAnalytics, getDb, getUserSettings, upsertUserSettings } from "./services";
import { sendProductEmail } from "./email";

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

export function recapVarsFromMonthly(
  monthly: unknown,
  ym: string,
  unit: "mi" | "km",
): {
  daysTracked: number;
  visitCount: number;
  activityCount: number;
  distanceLabel: string;
  monthLabel: string;
} | null {
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

export async function runMonthlyRecaps(env: Env, now = new Date()): Promise<{ considered: number; sent: number }> {
  const monthYm = lastCompleteMonthYm(now);
  const db = getDb(env);
  const users = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user);
  let considered = 0;
  let sent = 0;
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
      const monthly = await getAnalytics(tx, tenant, "monthly");
      const vars = recapVarsFromMonthly(
        monthly,
        monthYm,
        settings.distanceUnit === "km" ? "km" : "mi",
      );
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
  return { considered, sent };
}

import type { SubscriptionRow, SubscriptionStatus } from "./schema.js";

export const DEFAULT_GRACE_DAYS = 3;

export function isEntitled(
  sub: Pick<SubscriptionRow, "status" | "graceUntil"> | null | undefined,
  opts: { isDemo?: boolean; now?: Date } = {},
): boolean {
  if (opts.isDemo) return true;
  if (!sub) return false;
  const now = opts.now ?? new Date();
  if (sub.status === "active" || sub.status === "trialing") return true;
  if (sub.graceUntil && sub.graceUntil.getTime() > now.getTime()) return true;
  return false;
}

export function isReadOnlyGrace(
  sub: Pick<SubscriptionRow, "status" | "graceUntil"> | null | undefined,
  opts: { now?: Date } = {},
): boolean {
  if (!sub) return false;
  if (sub.status === "active" || sub.status === "trialing") return false;
  const now = opts.now ?? new Date();
  return Boolean(sub.graceUntil && sub.graceUntil.getTime() > now.getTime());
}

export function graceUntilFromPeriodEnd(
  periodEnd: Date | null | undefined,
  graceDays = DEFAULT_GRACE_DAYS,
): Date | null {
  if (!periodEnd) return null;
  return new Date(periodEnd.getTime() + graceDays * 24 * 60 * 60 * 1000);
}

const WRITE_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

export function subscriptionAllowsImport(status: SubscriptionStatus | undefined): boolean {
  return Boolean(status && WRITE_STATUSES.includes(status));
}

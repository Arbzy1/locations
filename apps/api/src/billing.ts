import Stripe from "stripe";
import {
  stripeEvents,
  subscriptions,
  graceUntilFromPeriodEnd,
  DEFAULT_GRACE_DAYS,
  eq,
  type SubscriptionStatus,
} from "@locations/db";
import type { Env } from "./env";
import type { Db } from "@locations/db";

export function stripeClient(env: Env): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export function priceIdForInterval(env: Env, interval: "monthly" | "yearly"): string | null {
  return interval === "yearly" ? env.STRIPE_PRICE_YEARLY ?? null : env.STRIPE_PRICE_MONTHLY ?? null;
}

function asStatus(raw: string | undefined): SubscriptionStatus {
  const allowed: SubscriptionStatus[] = [
    "none",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ];
  return allowed.includes(raw as SubscriptionStatus) ? (raw as SubscriptionStatus) : "none";
}

export async function syncSubscriptionFromStripe(
  db: Db,
  env: Env,
  stripeSub: Stripe.Subscription,
  tenant: string,
): Promise<void> {
  const graceDays = Number(env.GRACE_DAYS || DEFAULT_GRACE_DAYS);
  const periodEndUnix =
    stripeSub.items.data[0]?.current_period_end ??
    (stripeSub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
  const status = asStatus(stripeSub.status);
  const graceUntil =
    status === "active" || status === "trialing"
      ? null
      : graceUntilFromPeriodEnd(periodEnd, graceDays);

  await db
    .insert(subscriptions)
    .values({
      tenant,
      stripeCustomerId: String(stripeSub.customer),
      stripeSubscriptionId: stripeSub.id,
      status,
      priceId: stripeSub.items.data[0]?.price.id ?? null,
      currentPeriodEnd: periodEnd,
      graceUntil,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.tenant,
      set: {
        stripeCustomerId: String(stripeSub.customer),
        stripeSubscriptionId: stripeSub.id,
        status,
        priceId: stripeSub.items.data[0]?.price.id ?? null,
        currentPeriodEnd: periodEnd,
        graceUntil,
        updatedAt: new Date(),
      },
    });
}

export async function recordStripeEvent(db: Db, id: string, type: string): Promise<boolean> {
  try {
    await db.insert(stripeEvents).values({ id, type, processedAt: new Date() });
    return true;
  } catch {
    return false;
  }
}

export async function tenantForStripeCustomer(db: Db, customerId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  return rows[0]?.tenant ?? null;
}

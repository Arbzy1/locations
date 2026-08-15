import type { Env } from "../env";
import type { EmailKind, EmailVars } from "./kinds";
import { sendEmailSafe } from "./send";

export function isDemoRecipient(env: Env, email: string, role?: string | null): boolean {
  if (role === "demo") return true;
  const demo = env.DEMO_EMAIL?.trim().toLowerCase();
  return Boolean(demo && email.toLowerCase() === demo);
}

/** Billing status mail only. Do not email on every subscription.updated to active. */
export function billingEmailKind(eventType: string, status?: string): EmailKind | null {
  if (eventType === "checkout.session.completed") return "subscription_active";
  if (status === "past_due" || status === "unpaid") return "subscription_past_due";
  if (eventType === "customer.subscription.deleted" || status === "canceled") {
    return "subscription_canceled";
  }
  return null;
}

export async function sendProductEmail(
  env: Env,
  opts: {
    kind: EmailKind;
    to: string;
    role?: string | null;
    vars?: EmailVars;
    idempotencyKey?: string;
  },
): Promise<"sent" | "skipped" | "failed"> {
  return sendEmailSafe(env, {
    kind: opts.kind,
    to: opts.to,
    vars: opts.vars,
    idempotencyKey: opts.idempotencyKey,
    isDemo: isDemoRecipient(env, opts.to, opts.role),
  });
}

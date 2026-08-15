import type { Env } from "../env";
import type { EmailKind, EmailVars } from "./kinds";
import { renderEmail } from "./templates";

export type SendEmailOpts = {
  kind: EmailKind;
  to: string;
  vars?: EmailVars;
  idempotencyKey?: string;
  isDemo?: boolean;
};

function siteUrl(env: Env): string {
  return env.BETTER_AUTH_URL.replace(/\/$/, "");
}

function log(msg: string, kind: EmailKind, extra?: Record<string, unknown>) {
  console.info(JSON.stringify({ msg, kind, ...extra }));
}

export async function sendEmail(env: Env, opts: SendEmailOpts): Promise<"sent" | "skipped"> {
  if (opts.isDemo) {
  log("email_skipped", opts.kind, { ok: false, reason: "demo" });
    return "skipped";
  }
  if (!env.RESEND_API_KEY) {
    log("email_skipped", opts.kind, { ok: false, reason: "no_key" });
    return "skipped";
  }

  const rendered = renderEmail(opts.kind, {
    ...opts.vars,
    siteUrl: opts.vars?.siteUrl ?? siteUrl(env),
  });
  const from = env.EMAIL_FROM || "Locations <noreply@localhost>";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey.slice(0, 256);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tags: [{ name: "kind", value: opts.kind }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    log("email_failed", opts.kind, { ok: false, status: res.status });
    throw new Error(`Email send failed: ${res.status} ${body.slice(0, 200)}`);
  }
  log("email_sent", opts.kind, { ok: true });
  return "sent";
}

/** Import and billing must not fail the parent job if Resend is down. */
export async function sendEmailSafe(env: Env, opts: SendEmailOpts): Promise<"sent" | "skipped" | "failed"> {
  try {
    return await sendEmail(env, opts);
  } catch {
    return "failed";
  }
}

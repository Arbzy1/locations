import type { Env } from "./env";

export async function sendEmail(
  env: Env,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.info(JSON.stringify({ msg: "email_skipped", to: opts.to, subject: opts.subject }));
    return;
  }
  const from = env.EMAIL_FROM || "Locations <noreply@localhost>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html ?? `<p>${escapeHtml(opts.text)}</p>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

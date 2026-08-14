import type { EmailKind, EmailVars } from "./kinds";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function site(vars: EmailVars): string {
  return (vars.siteUrl ?? "https://locations.aden.website").replace(/\/$/, "");
}

function wrap(title: string, innerHtml: string, innerText: string, vars: EmailVars): {
  subject: string;
  html: string;
  text: string;
} {
  const origin = site(vars);
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:12px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#666;">Locations</p>
      <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(title)}</h1>
      ${innerHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#666;">
        <a href="${escapeHtml(origin)}/privacy">Privacy</a>
        · <a href="${escapeHtml(origin)}/terms">Terms</a>
        · This message does not include map or Timeline details.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Locations\n${title}\n\n${innerText}\n\nPrivacy: ${origin}/privacy\nTerms: ${origin}/terms\nThis message does not include map or Timeline details.\n`;
  return { subject: title, html, text };
}

function cta(url: string, label: string): { html: string; text: string } {
  return {
    html: `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></p>
      <p style="font-size:12px;color:#666;word-break:break-all;">${escapeHtml(url)}</p>`,
    text: `${label}: ${url}`,
  };
}

function otpBlock(code: string): { html: string; text: string } {
  return {
    html: `<p style="font-size:28px;letter-spacing:.2em;font-family:ui-monospace,monospace;">${escapeHtml(code)}</p>
      <p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>`,
    text: `Your code: ${code}\nThis code expires in 5 minutes. If you did not request it, you can ignore this email.`,
  };
}

export function renderEmail(
  kind: EmailKind,
  vars: EmailVars,
): { subject: string; html: string; text: string } {
  switch (kind) {
    case "verify_email_link": {
      const link = cta(vars.url ?? "", "Verify email");
      return wrap(
        "Verify your Locations email",
        `<p>Confirm this address to import Timeline data.</p>${link.html}`,
        `Confirm this address to import Timeline data.\n${link.text}`,
        vars,
      );
    }
    case "verify_email_otp": {
      const otp = otpBlock(vars.otp ?? "");
      return wrap("Your Locations verification code", otp.html, otp.text, vars);
    }
    case "password_reset_link": {
      const link = cta(vars.url ?? "", "Reset password");
      return wrap(
        "Reset your Locations password",
        `<p>Use this link to choose a new password. It expires soon.</p>${link.html}`,
        `Use this link to choose a new password. It expires soon.\n${link.text}`,
        vars,
      );
    }
    case "magic_link": {
      const link = cta(vars.url ?? "", "Sign in to Locations");
      return wrap(
        "Your Locations sign-in link",
        `<p>This link signs you in without a password. It expires in 5 minutes.</p>${link.html}`,
        `This link signs you in without a password. It expires in 5 minutes.\n${link.text}`,
        vars,
      );
    }
    case "signin_otp": {
      const otp = otpBlock(vars.otp ?? "");
      return wrap("Your Locations sign-in code", otp.html, otp.text, vars);
    }
    case "change_email_verify": {
      const link = cta(vars.url ?? "", "Confirm new email");
      return wrap(
        "Confirm your new Locations email",
        `<p>Someone asked to use this address on a Locations account.</p>${link.html}`,
        `Someone asked to use this address on a Locations account.\n${link.text}`,
        vars,
      );
    }
    case "password_changed":
      return wrap(
        "Your Locations password changed",
        `<p>The password on your account was just changed. If this was not you, reset it from the sign-in page.</p>`,
        `The password on your account was just changed. If this was not you, reset it from the sign-in page.`,
        vars,
      );
    case "email_changed":
      return wrap(
        "Your Locations email changed",
        `<p>This address is no longer the sign-in email for your Locations account. If this was not you, contact support from the site.</p>`,
        `This address is no longer the sign-in email for your Locations account. If this was not you, contact support from the site.`,
        vars,
      );
    case "import_ready": {
      const visits = vars.visitCount ?? 0;
      const activities = vars.activityCount ?? 0;
      return wrap(
        "Your Timeline import is ready",
        `<p>Import finished. ${visits} visits and ${activities} journeys were written. Open Locations to view the map.</p>`,
        `Import finished. ${visits} visits and ${activities} journeys were written. Open Locations to view the map.`,
        vars,
      );
    }
    case "import_failed":
      return wrap(
        "Your Timeline import failed",
        `<p>We could not finish that import. Try again from Settings with a Timeline JSON or zip file. No map details are included here.</p>`,
        `We could not finish that import. Try again from Settings with a Timeline JSON or zip file. No map details are included here.`,
        vars,
      );
    case "subscription_active":
      return wrap(
        "Locations subscription is active",
        `<p>Billing is active. You can import Timeline data from Settings. Stripe sends its own receipts separately.</p>`,
        `Billing is active. You can import Timeline data from Settings. Stripe sends its own receipts separately.`,
        vars,
      );
    case "subscription_past_due":
      return wrap(
        "Locations payment failed",
        `<p>A payment did not go through. Your Timeline stays readable during a short grace period. Update the card in Settings, Manage billing.</p>`,
        `A payment did not go through. Your Timeline stays readable during a short grace period. Update the card in Settings, Manage billing.`,
        vars,
      );
    case "subscription_canceled":
      return wrap(
        "Locations subscription canceled",
        `<p>Your paid plan has ended. Existing Timeline data stays in the account. Import is disabled until you subscribe again.</p>`,
        `Your paid plan has ended. Existing Timeline data stays in the account. Import is disabled until you subscribe again.`,
        vars,
      );
    case "account_deleted":
      return wrap(
        "Your Locations account was deleted",
        `<p>We removed your account, Timeline rows, uploads, sessions, and billing customer. This cannot be undone.</p>`,
        `We removed your account, Timeline rows, uploads, sessions, and billing customer. This cannot be undone.`,
        vars,
      );
  }
}

# Transactional email

Locations sends **account and status mail only**. There is no marketing list, newsletter, or activity digest.

Stripe still sends its own receipts. We send a separate billing *status* message when entitlement changes.

## What we send

| Kind | When |
|------|------|
| `verify_email_link` | Signup / resend verification |
| `verify_email_otp` | Same flow, 6-digit code |
| `password_reset_link` | Forgot password |
| `magic_link` | Passwordless sign-in link |
| `signin_otp` | Passwordless 6-digit code |
| `change_email_verify` | Confirm a new email address |
| `password_changed` | After password change or reset |
| `email_changed` | Notice to the **old** address |
| `import_ready` | Import job finished (visit/activity counts only) |
| `import_failed` | Import job failed (generic; no file body) |
| `subscription_active` | Checkout completed (`active` / `trialing`) |
| `subscription_past_due` | Status `past_due` or `unpaid` |
| `subscription_canceled` | Status `canceled` |
| `account_deleted` | Last send before account wipe |

Messages never include coordinates, place names, day routes, or Takeout payloads. Import mail uses counts only.

## What we do not send

Marketing, newsletters, year-in-review mail, "you visited X", or magic links that open a specific day or map.

## Opt-out

These messages are transactional (sign-in, security, import, billing, deletion). There is no unsubscribe. Delete the account to stop them.

## Operator setup

1. Create a Resend account and verify the sending domain (for aden.website, add the DNS records Resend shows).
2. Set `RESEND_API_KEY` (Worker secret) and `EMAIL_FROM` (for example `Locations <noreply@aden.website>`).
3. `EMAIL_FROM` must use that verified domain when the API key is set.
4. Leave `RESEND_API_KEY` empty in local/dev if you do not want to send. The app **skips** send and does not throw.

Demo accounts (`role === demo` / tenant `demo`) never receive mail.

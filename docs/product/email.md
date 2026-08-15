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
| `change_email_verify` | Confirm an email change from the **current** inbox. Better Auth then sends `verify_email_link` to the new address. |
| `password_changed` | After password change or reset |
| `email_changed` | Catalog notice for a previous address. The 1.6 confirm-then-verify flow uses `change_email_verify` on the current inbox instead. |
| `import_ready` | Import job finished (visit/activity counts only) |
| `import_failed` | Import job failed (generic; no file body) |
| `subscription_active` | Checkout completed (`active` / `trialing`) |
| `subscription_past_due` | Status `past_due` or `unpaid` |
| `subscription_canceled` | Status `canceled` |
| `account_deleted` | Last send before account wipe |
| `monthly_recap` | Opt-in counts-only recap for the previous month (days, journeys, distance label). Off by default. |

Messages never include coordinates, place names, day routes, or Takeout payloads. Import mail uses counts only. The monthly recap is the same: counts and a generic Insights link, never "you visited X".

## What we do not send

Marketing, newsletters, year-in-review mail, "you visited X", or magic links that open a specific day or map. The opt-in monthly recap is product mail, not a digest of places.

## Opt-out

These messages are transactional (sign-in, security, import, billing, deletion). There is no unsubscribe for those. The monthly recap is **opt-in** in Settings and stays off until you enable it. Delete the account to stop all mail.

## Operator setup

1. Create a Resend account and verify the sending domain (for aden.website, add the DNS records Resend shows).
2. Set `RESEND_API_KEY` (Worker secret) and `EMAIL_FROM` (for example `Locations <noreply@aden.website>`).
3. `EMAIL_FROM` must use that verified domain when the API key is set.
4. Leave `RESEND_API_KEY` empty in local/dev if you do not want to send. The app **skips** send and does not throw.

Demo accounts (`role === demo` / tenant `demo`) never receive mail.

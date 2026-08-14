# Auth and billing

## Auth

Better Auth email/password, plus magic link and email OTP plugins. Signup is enabled unless `DISABLE_SIGNUP=true`. Verification, reset, magic link, OTP, and change-email use Resend (`RESEND_API_KEY`, `EMAIL_FROM`). If the API key is unset, send is skipped and signup still succeeds.

Forgot-password links go to `/reset-password`. Settings can change password (other sessions revoked), change email (re-verify), and resend verification.

Demo: `POST /api/auth/demo` signs in with server-side `DEMO_EMAIL` / `DEMO_PASSWORD`. The client must not embed the demo password. Demo never receives email.

See [Transactional email](../product/email.md) for the kind catalog.

## Billing

- `POST /api/billing/checkout` creates a Stripe Checkout Session for `monthly` or `yearly`.
- `POST /api/billing/portal` creates a Customer Portal session.
- `POST /api/billing/webhook` verifies Stripe signatures, upserts `stripe_events` for idempotency, syncs `subscriptions`, then may send `subscription_active` / `subscription_past_due` / `subscription_canceled` (not on every `subscription.updated` to `active`).

Entitlements: `active` and `trialing` may import. Demo is always allowed to read sample data. Lapsed subscribers get a read-only grace (`GRACE_DAYS`, default 3). Stripe still sends its own receipts.

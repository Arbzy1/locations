# Auth and billing

## Auth

Better Auth email/password. Signup is enabled unless `DISABLE_SIGNUP=true`. Verification and password reset use Resend (`RESEND_API_KEY`, `EMAIL_FROM`).

Demo: `POST /api/auth/demo` signs in with server-side `DEMO_EMAIL` / `DEMO_PASSWORD`. The client must not embed the demo password.

## Billing

- `POST /api/billing/checkout` creates a Stripe Checkout Session for `monthly` or `yearly`.
- `POST /api/billing/portal` creates a Customer Portal session.
- `POST /api/billing/webhook` verifies Stripe signatures, upserts `stripe_events` for idempotency, syncs `subscriptions`.

Entitlements: `active` and `trialing` may import. Demo is always allowed to read sample data. Lapsed subscribers get a read-only grace (`GRACE_DAYS`, default 3).

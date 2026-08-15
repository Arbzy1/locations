# Auth and billing

## Auth

Better Auth 1.6 email/password, plus magic link and email OTP plugins. Signup is enabled unless `DISABLE_SIGNUP=true`. Email verification is always required (signup kill switch does not turn it off). Verification, reset, magic link, OTP, and change-email use Resend (`RESEND_API_KEY`, `EMAIL_FROM`). If the API key is unset, send is skipped and signup still succeeds. Magic-link `callbackURL` is checked with origin equality against `trustedOrigins` (`BETTER_AUTH_URL`).

Forgot-password links go to `/reset-password`. Settings can change password (other sessions revoked), change email (confirm current inbox, then verify the new inbox; other sessions revoked), resend verification, list sessions, and revoke a device or all other sessions. Password reset also revokes existing sessions (`revokeSessionsOnPasswordReset`). Stored email OTPs are hashed.

Demo: `POST /api/auth/demo` signs in with server-side `DEMO_EMAIL` / `DEMO_PASSWORD`. The client must not embed the demo password. Demo never receives email. Demo may list/revoke its own sessions and download the sample GDPR pack.

See [Transactional email](../product/email.md) for the kind catalog.

## Billing

- `POST /api/billing/checkout` creates a Stripe Checkout Session for `monthly` or `yearly`.
- `POST /api/billing/portal` creates a Customer Portal session.
- `POST /api/billing/webhook` verifies Stripe signatures, upserts `stripe_events` for idempotency, syncs `subscriptions`, then may send `subscription_active` / `subscription_past_due` / `subscription_canceled` (not on every `subscription.updated` to `active`).

Invoices, payment method, pause, and cancel live in the Stripe Customer Portal. In the Stripe Dashboard, enable Customer Portal pause so subscribers can pause instead of only cancel. Pause keeps the Stripe subscription (access follows Stripe pause rules; `paused` is a stored status). Cancel ends access at period end. Failed payment still uses the in-app grace copy.

Entitlements: `active` and `trialing` may import. Demo is always allowed to read sample data. Lapsed subscribers get a read-only grace (`GRACE_DAYS`, default 3). Stripe still sends its own receipts.

## Account export

- `GET /api/account/export` is a small JSON summary (overview, sources, settings, labels).
- `POST /api/account/export-pack` builds a ZIP on R2 (`exports/{userId}/{jobId}.zip`) via `waitUntil`: `account.json`, `visits.jsonl`, `activities.jsonl`, `README.html` (counts and source labels, no map tiles). One active job per tenant. The file is deleted after download. Never emailed.

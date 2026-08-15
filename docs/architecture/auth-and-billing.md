# Auth and billing

## Auth

Better Auth 1.6 email/password, plus optional Google OAuth, magic link, and email OTP plugins. Signup is enabled unless `DISABLE_SIGNUP=true`. Email verification is always required (signup kill switch does not turn it off). Verification, reset, magic link, OTP, and change-email use Resend (`RESEND_API_KEY`, `EMAIL_FROM`). If the API key is unset, send is skipped and signup still succeeds. Magic-link `callbackURL` is checked with origin equality against `trustedOrigins` (`BETTER_AUTH_URL`).

### Google OAuth

Optional. Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Worker secrets (never `VITE_*`). `GET /api/config` then returns `googleAuth: true` so the UI can show Continue with Google. The client id is not sent to the browser.

In Google Cloud Console, create an OAuth 2.0 **Web application** client:

1. Authorized JavaScript origins: `BETTER_AUTH_URL` (for example `https://locations.aden.website` or `http://localhost:8787`).
2. Authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`.
3. Copy the client id and secret into `.env*` / `.dev.vars*` and `npm run cf:sync` for staging/prod.

Sign-in is a full-page redirect, not a popup, so `Cross-Origin-Opener-Policy: same-origin` stays. Do not add Google JS CDNs or GIS One Tap. CSP does not need `accounts.google.com` in `connect-src`.

`DISABLE_SIGNUP` and the ops signup flag also set Google `disableSignUp`. Existing Google users can still sign in. Google-verified emails count as verified, so import is not blocked the way unverified password signups are. Existing email users with the same verified address can link via `trustedProviders: ["google"]`.

Forgot-password links go to `/reset-password`. Settings can change password (other sessions revoked), change email (confirm current inbox, then verify the new inbox; other sessions revoked), resend verification, list sessions, and revoke a device or all other sessions. Password reset also revokes existing sessions (`revokeSessionsOnPasswordReset`). Stored email OTPs are hashed.

Demo: `POST /api/auth/demo` signs in with server-side `DEMO_EMAIL` / `DEMO_PASSWORD`. The client must not embed the demo password. Demo never receives email. Demo may list/revoke its own sessions and download the sample GDPR pack.

Staff (`admin`, `developer`) skip the Stripe import gate on their **own** tenant. They also get `/api/admin/*` for accounts and ops. `admin` may mutate flags (including reset-to-env), invite `user`/`developer`, send password reset, verify/unverify, revoke sessions, fail stuck jobs, email a self-test to their own inbox, and wipe (email confirm). `developer` is read-only on those routes (404 on PATCH/POST). Non-staff gets **404**, not 403. Location reads still use `withTenant(tenantForUser(target))` for counts only. No impersonation and no admin map of another user’s Timeline.

`ops_flags` overlays wrangler `DISABLE_SIGNUP` / `LANDING_ENABLED` / `GLOBE_ENABLED` / `DEMO_TOUR` when a row is present. `ops_audit` logs staff actions (ids and counts, no coordinates).

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

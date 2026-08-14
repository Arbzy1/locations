# Rotate secrets

1. `npx wrangler secret put BETTER_AUTH_SECRET` (all sessions die).
2. Rotate Neon role password; update `DATABASE_URL`.
3. Stripe: new webhook secret + `STRIPE_WEBHOOK_SECRET`.
4. Resend API key.
5. Confirm `/api/health` and a test login.

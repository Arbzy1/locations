# Rotate secrets

Worker secrets are per Wrangler environment. Repeat each `secret put` with `--env staging` and `--env production`.

1. `npx wrangler secret put BETTER_AUTH_SECRET --env staging` (and `--env production`). All sessions on that env die.
2. Rotate Neon role password; update that env's `DATABASE_URL` (`wrangler secret put DATABASE_URL --env …`). Staging and production must stay on separate databases.
3. Stripe: new webhook secret + `STRIPE_WEBHOOK_SECRET` for that env (test keys on staging, live on production).
4. Resend API key.
5. Confirm `/api/health` and a test login on the matching host.

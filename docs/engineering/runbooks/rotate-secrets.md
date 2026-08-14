# Rotate secrets

Worker secrets are per Wrangler environment.

1. Rotate the auth secret locally and optionally push:

   ```bash
   npm run secrets:rotate -- --env staging
   npm run secrets:rotate -- --env production
   ```

   Or `--env all` to push both staging and production (not local). This writes `.env.<env>` / `.dev.vars.<env>` and runs `wrangler secret put BETTER_AUTH_SECRET`. All sessions on that env die.
2. Rotate Neon role password; update that env's `DATABASE_URL` (`wrangler secret put DATABASE_URL --env …`). Staging and production must stay on separate databases.
3. Stripe: new webhook secret + `STRIPE_WEBHOOK_SECRET` for that env (test keys on staging, live on production).
4. Resend API key.
5. Confirm `/api/health` and a test login on the matching host.

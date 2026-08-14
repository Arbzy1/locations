# Rotate secrets

Worker secrets are per Wrangler environment.

1. Rotate the auth secret locally and push to Cloudflare:

   ```bash
   npm run secrets:rotate -- --env staging
   npm run secrets:rotate -- --env production
   ```

   Or `--env all` for staging and production (not local). This writes `.env.<env>` and `.dev.vars.<env>`, then `wrangler secret bulk`. All sessions on that env die.
2. After changing `DATABASE_URL`, Stripe, or Resend in those files, run `npm run cf:sync:staging` or `npm run cf:sync:prod`.
3. Staging and production must stay on separate Neon databases.
4. Confirm `/api/health` and a test login on the matching host.

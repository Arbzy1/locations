# Rotate secrets

Worker secrets are per Wrangler environment.

1. Rotate the auth secret in the env files and push to Cloudflare:

   ```bash
   npm run secrets:rotate
   ```

   That updates every `.env*` / `.dev.vars*` pair and runs `wrangler secret bulk` for staging and production. All sessions on those envs die.

   One environment only:

   ```bash
   npm run secrets:rotate -- --env staging
   npm run secrets:rotate -- --env production
   npm run secrets:rotate -- --env local
   ```

2. After changing `DATABASE_URL`, Stripe, Resend, map URLs, or any other Worker secret in those files, run `npm run cf:sync:staging` or `npm run cf:sync:prod`. `cf:sync` uploads every filled key from `.env*.example` that is not a wrangler.toml var.
3. Staging and production must stay on separate Neon databases.
4. Confirm `/api/health` and a test login on the matching host.

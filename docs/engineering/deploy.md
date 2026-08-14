# Deploy

Named Wrangler environments isolate staging and production. Top-level `wrangler.toml` is for `wrangler dev` only (`locations-dev`). Never run a bare `wrangler deploy`.

| | Staging | Production |
|---|---|---|
| Worker | `locations-staging` | `locations` |
| URL | https://locations-staging.aden.website | https://locations.aden.website |
| R2 | `locations-uploads-staging` | `locations-uploads` |
| Queue | `locations-imports-staging` | `locations-imports` |
| Neon | separate `DATABASE_URL` secret | production `DATABASE_URL` |
| Stripe | test-mode keys + webhook to staging URL | live keys |
| CSP | `CSP_ENFORCE=false` | `CSP_ENFORCE=true` |

Push to `main` deploys staging. Production is a manual promote (`npm run deploy:prod` or the production GitHub Action).

## First-run checklist

1. Create a Neon **staging** database (or branch). Do not reuse the production connection string.
2. Migrate each database:

   ```bash
   npm run db:migrate -- --env staging
   npm run db:migrate -- --env production
   ```

   Fill `.env.staging` / `.env.production` first (`npm run env:merge`). Each file needs its own `DATABASE_URL`.

3. Cloudflare resources (same account as `wrangler.toml`): R2 `locations-uploads-staging`, queues `locations-imports-staging` and `locations-imports`. Production R2 `locations-uploads` already exists. Staging custom domain is `locations-staging.aden.website` (`custom_domain = true` in the staging env).
4. Put Worker secrets per env. Worker secrets stay on Cloudflare. Do not put `DATABASE_URL` in GitHub Actions.

   ```bash
   npx wrangler secret put DATABASE_URL --env staging
   npx wrangler secret put BETTER_AUTH_SECRET --env staging
   npx wrangler secret put RESEND_API_KEY --env staging
   npx wrangler secret put DEMO_EMAIL --env staging
   npx wrangler secret put DEMO_PASSWORD --env staging
   npx wrangler secret put STRIPE_SECRET_KEY --env staging
   npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
   npx wrangler secret put STRIPE_PRICE_MONTHLY --env staging
   npx wrangler secret put STRIPE_PRICE_YEARLY --env staging

   npx wrangler secret put DATABASE_URL --env production
   npx wrangler secret put BETTER_AUTH_SECRET --env production
   # same list for production, using live Stripe keys
   ```

   Staging Stripe: test-mode keys. Add a Stripe test webhook to `https://locations-staging.aden.website/api/billing/webhook`. Production keeps live keys and the existing live webhook.

   Optional map vars (`MAP_TILE_*`, `OSRM_BASE`, `GEOCODE_BASE`) can live in `[env.*.vars]` or as secrets.

5. Deploy staging and confirm health:

   ```bash
   npm run deploy:staging
   # GET https://locations-staging.aden.website/api/health
   ```

6. Deploy production once staging looks right:

   ```bash
   npm run deploy:prod
   ```

7. GitHub: add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (`8507815ae44383c8d60535ea462f5124`). Enable the deploy workflows. Token needs Workers, R2, and Queues edit on this account.

Local CLI secrets: `.env` / `.dev.vars`. Staging: `.env.staging` / `.dev.vars.staging`. Production: `.env.production` / `.dev.vars.production`. Wrangler named envs read `.dev.vars.<env>` during `wrangler dev --env …`.

## npm scripts

| Script | Command |
|--------|---------|
| `deploy:staging` | `npm run build:all && wrangler deploy --env staging` |
| `deploy:prod` | `npm run build:all && wrangler deploy --env production` |
| `deploy:preview` | `npm run build:all && wrangler versions upload --env staging` |

`deploy:prod` requires `--env production`. A deploy without `--env` targets the local-only Worker name `locations-dev`, not production.

## GitHub Actions

CI (`.github/workflows/ci.yml`) stays on pull requests and pushes: unit, integration, typecheck, and RLS when `DATABASE_URL` is set for that job only.

| Workflow | Trigger | Wrangler |
|----------|---------|----------|
| `deploy-staging.yml` | push to `main` | `deploy --env staging` |
| `deploy-production.yml` | `workflow_dispatch` only | `deploy --env production` |

Both workflows run `npm ci`, unit + integration tests, typecheck, `build:all`, then `cloudflare/wrangler-action`. They must **not** receive `DATABASE_URL` or other Worker secrets. Those are already on the Worker from `wrangler secret put`.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

E2E against staging (`PLAYWRIGHT_BASE_URL=https://locations-staging.aden.website`) is a later follow-up.

## Helper

```bash
node scripts/deploy-setup.mjs
```

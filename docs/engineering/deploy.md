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
| CSP | `CSP_ENFORCE=true` | `CSP_ENFORCE=true` |

Push to `main` deploys staging. Production is a manual promote (`npm run deploy:prod` or the production GitHub Action).

## First-run checklist

1. Create a Neon **staging** database (or branch). Do not reuse the production connection string.
2. Migrate each database:

   ```bash
   npm run db:migrate:staging
   npm run db:migrate:prod
   ```

   Fill `.env.staging` / `.env.production` first (`npm run env:merge`). Each file needs its own `DATABASE_URL`.

3. Cloudflare resources (same account as `wrangler.toml`): R2 `locations-uploads-staging`, queues `locations-imports-staging` and `locations-imports`. Production R2 `locations-uploads` already exists. Staging custom domain is `locations-staging.aden.website` (`custom_domain = true` in the staging env).
4. Put Worker secrets per env. Worker secrets stay on Cloudflare. Do not put `DATABASE_URL` in GitHub Actions.

   ```bash
   npm run secrets:generate -- --env staging
   npm run cf:sync:staging
   npm run secrets:generate -- --env production
   npm run cf:sync:prod
   ```

   Or `node scripts/cf-sync.mjs --dry-run` / `npm run cf:sync:dry` to list keys without uploading. Keys come from `.env*.example` minus plaintext `[vars]` in `wrangler.toml`. Blank and example placeholders are skipped (existing Cloudflare values stay). Secrets on the Worker that are no longer in that list are deleted. Use `--no-prune` to skip deletion.

   Staging Stripe: test-mode keys. Add a Stripe test webhook to `https://locations-staging.aden.website/api/billing/webhook`. Production keeps live keys and the existing live webhook.

   Optional map vars (`MAP_TILE_*`, `MAP_STYLE_*`, `MAP_CUSTOM_TILE_HOSTS`, `OSRM_BASE`, `GEOCODE_BASE`) can live in `[env.*.vars]` or as secrets.

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
| `deploy:staging` | Build, then `wrangler deploy --env staging --secrets-file` from local env files |
| `deploy:prod` | Same for `--env production` |
| `deploy:both` | Build once, then staging, then production |
| `deploy:preview` | `wrangler versions upload --env staging --secrets-file` |

`deploy:prod` always uses `--env production`. A deploy without `--env` targets the local-only Worker name `locations-dev`, not production.

Local `deploy:*` scripts pass `--secrets-file` from `.env.<env>` / `.dev.vars.<env>`. That is required on first deploy: `wrangler secret bulk` can store secrets on a version that `secrets.required` does not count until they are attached to a code deploy.

## GitHub Actions

CI (`.github/workflows/ci.yml`) stays on pull requests and pushes: unit, integration, typecheck, and RLS when `DATABASE_URL` is set for that job only.

| Workflow | Trigger | Wrangler |
|----------|---------|----------|
| `deploy-staging.yml` | push to `main` | `deploy --env staging` |
| `deploy-production.yml` | `workflow_dispatch` only | `deploy --env production` |

Both workflows run `npm ci`, unit + integration tests, typecheck, `build:all`, then `cloudflare/wrangler-action`. They must **not** receive `DATABASE_URL` or other Worker secrets. Those are already on the Worker from `npm run cf:sync`.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

E2E against staging (`PLAYWRIGHT_BASE_URL=https://locations-staging.aden.website`) is a later follow-up.

## Helper

```bash
node scripts/deploy-setup.mjs
```

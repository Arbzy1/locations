# Local setup

```bash
npm install
npm run setup:project
npm run dev:all
```

Day-to-day UI is **http://localhost:5173** (Vite HMR; `/api` proxies to 8787). Wrangler on **http://localhost:8787** is the API. It serves the last `apps/web/dist` if you have built one, or a stub that points you at :5173.

Magic links, Google OAuth, Stripe returns, and Playwright need the production SPA on :8787:

```bash
npm run dev:e2e
```

`dev:web` / `dev:api` still start a single workspace. `dev:api` writes a stub `apps/web/dist/index.html` when dist is missing so Wrangler can start.

Secrets live in per-environment files (all gitignored except `*.example`):

| Environment | Node / CLI | Wrangler (`wrangler dev`) |
|-------------|------------|---------------------------|
| Local | `.env` | `.dev.vars` |
| Staging | `.env.staging` | `.dev.vars.staging` |
| Production | `.env.production` | `.dev.vars.production` |

Helpers:

```bash
npm run env:merge                         # create/fill all three pairs from examples
npm run env:merge -- --env staging        # staging only
npm run env:sync -- --env staging         # copy secrets .env.staging → .dev.vars.staging
npm run secrets:generate                      # fill placeholder BETTER_AUTH_SECRET in all env pairs
npm run cf:sync:staging                       # upload .env.staging secrets to the Worker
npm run dev:kill                          # free leftover Vite / Wrangler / inspector ports
npm run auth:promote-admin -- you@email.com --env staging
npm run db:migrate:dev
npm run db:migrate:staging
```

See the root [README](../../README.md).

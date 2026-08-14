# Local setup

```bash
npm install
npm run setup:project
npm run build:web
npm run dev:api
```

Optional: `npm run dev:web` for Vite HMR (proxies `/api` to 8787).

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
npm run secrets:generate -- --env staging
npm run kill:servers                      # free Vite :5173 and Wrangler :8787
npm run auth:promote-admin -- you@email.com --env staging
npm run db:migrate -- --env staging       # or LOCATIONS_ENV=staging npm run db:migrate
```

See the root [README](../../README.md).

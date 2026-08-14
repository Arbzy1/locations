# Locations

Explore **your** Google Timeline as a private map journal: heatmaps, day views, trips, and insights.

Hosted SaaS on **Cloudflare Workers**, **Neon**, **Better Auth**, and **Stripe**.

![Locations](docs/screenshot.png)

## Live site

[locations.aden.website](https://locations.aden.website):

1. **Public demo** - click “Try the demo” for sample journeys (password stays on the server)
2. **Your account** - sign up, verify email, import Timeline JSON or a Takeout zip, subscribe if billing is enabled

Tenants are isolated in the app layer and with FORCE RLS (`app.tenant`). Demo users map to tenant `demo`.

## Self-host

### What you need

- Node 20+
- [Neon](https://neon.tech) Postgres
- (Optional) Cloudflare account, Stripe, Resend, commercial map tiles

### Export from Google

1. Open [Google Takeout](https://takeout.google.com/)
2. Select **Location History** / Timeline only
3. Upload the zip in Settings, or extract Timeline.json / Records.json
4. Keep real exports **outside** git

### One-command setup

```bash
git clone https://github.com/Arbzy1/locations.git
cd locations
npm install
npm run setup:project
```

Then:

```bash
npm run build:web
npm run dev:api    # open http://localhost:8787
```

Set `DISABLE_SIGNUP=true` if you want invite-only again (`npm run auth:create-user`).

### Deploy

See [docs/engineering/deploy.md](docs/engineering/deploy.md). Staging and production are named Wrangler environments. Never run a bare `wrangler deploy`.

```bash
npx wrangler login
npm run secrets:generate -- --env staging
npm run cf:sync:staging
npm run deploy:staging
# GET https://locations-staging.aden.website/api/health

npm run secrets:generate -- --env production
npm run cf:sync:prod
npm run deploy:prod
```

## What it does

Full list: [docs/product/features.md](docs/product/features.md).

- **Hotspots** - visit density heatmap, ranked places, date and source filters
- **Day View** - one day on a map with a timeline (road geometry when cached)
- **Day Trips** - days with more range or more places; filter and open in Day View
- **Insights** - totals, monthly/yearly charts, corridors, home/work guess
- **Settings** - Timeline JSON or zip import, sources, billing, units, delete account
- **Account** - signup, login, forgot password, demo, dark/light theme

## Stack

| Layer | Tech |
|-------|------|
| Edge | Cloudflare Workers + Static Assets |
| API | Hono |
| Auth | Better Auth (email/password, public signup unless disabled) |
| Billing | Stripe Checkout + Customer Portal |
| DB | Neon Postgres + Drizzle ORM + FORCE RLS |
| UI | React 19, Vite, Tailwind 4, shadcn/ui, Motion, Leaflet, Recharts |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run setup:project` | Interactive first-time Neon + import + admin user |
| `npm run deploy:staging` | Build web + `wrangler deploy --env staging` |
| `npm run deploy:prod` | Build web + `wrangler deploy --env production` |
| `npm run deploy:both` | Build once, then staging, then production |
| `npm run db:migrate:dev` | Apply schema (local `.env`) |
| `npm run db:migrate:staging` / `db:migrate:prod` | Apply schema to staging / production |
| `npm run db:migrate:all` | Migrate local, staging, then production |
| `npm run db:import` | CLI JSON import |
| `npm run test:unit` | Vitest unit project |
| `npm run test:integration` | Vitest integration project |
| `npm run test:rls` | RLS leak tests (skips without `DATABASE_URL`) |
| `npm run test:e2e` | Playwright (requires API at `:8787`) |
| `npm run rules:sync` | Regenerate AI tool rule files from `AGENTS.md` |

## Testing

```bash
npm run test:unit
npm run test:integration
npm run test:rls

npm run build:web
npm run dev:api
# other terminal:
npm run test:e2e
```

Security: [docs/security/README.md](docs/security/README.md). Agent conventions: `AGENTS.md`.

## Privacy

- Real Takeout JSON is gitignored. Only sample data ships in the repo.
- Do not commit `.env`, `.env.staging`, `.env.production`, `.dev.vars*`, or database credentials.
- Delete account in Settings wipes Neon rows, R2 uploads, and the Stripe customer.

## License

MIT. See [LICENSE](LICENSE).

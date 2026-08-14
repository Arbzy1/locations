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
npx wrangler secret put DATABASE_URL --env staging
npx wrangler secret put BETTER_AUTH_SECRET --env staging
# optional: RESEND_API_KEY, STRIPE_*, DEMO_* with --env staging
npm run deploy:staging
# GET https://locations-staging.aden.website/api/health

npx wrangler secret put DATABASE_URL --env production
npx wrangler secret put BETTER_AUTH_SECRET --env production
npm run deploy:prod
```

## What it does

- **Hotspots** - visit density heatmap (date and source filters)
- **Day View** - map + timeline with snapped journeys
- **Day Trips** - multi-cluster / long-range days, plus multi-day grouping
- **Insights** - distance, corridors, home/work guess, year in review
- **Settings** - zip/JSON import, merge, billing, units, delete account

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
| `npm run db:migrate` | Apply schema |
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
- Do not commit `.env`, `.dev.vars`, or database credentials.
- Delete account in Settings wipes Neon rows, R2 uploads, and the Stripe customer.

## License

MIT. See [LICENSE](LICENSE).

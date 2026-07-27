# Locations

Private location-history explorer — a portfolio map journal built on **Cloudflare Workers**, **Neon Postgres**, and **Better Auth**.

> **Live:** [locations.aden.website](https://locations.aden.website) (invite-only)  
> Real Google Takeout data stays in Neon. This repo never contains location JSON.

![Locations](docs/screenshot.png)

## What it does

- **Hotspots** — visit density heatmap
- **Day View** — map + timeline with OSRM-snapped journeys
- **Day Trips** — multi-cluster / long-range days
- **Insights** — distance, corridors, yearly/monthly stats, fun facts

All data routes require a signed-in session. Public signup is disabled; accounts are created with a CLI invite.

## Stack

| Layer | Tech |
|-------|------|
| Edge | Cloudflare Workers + Static Assets |
| API | Hono |
| Auth | Better Auth (email/password, invite-only) |
| DB | Neon Postgres + Drizzle ORM |
| UI | React 19, Vite, Tailwind 4, Leaflet, Recharts |

```
Browser ──► Worker (assets + /api/*)
                │
                ├── Better Auth session
                └── Neon (visits, activities, analytics, route/place cache)
```

## Quick start

### Prerequisites

- Node 20+
- Neon project (`DATABASE_URL`)
- Cloudflare account + Wrangler
- Local `location-history.json` (Google Takeout) **outside** git

### Setup

```bash
cp .env.example .env
# fill DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL=http://localhost:8787
# set DATA_PATH to your location-history.json

npm install
npm run db:migrate
npm run db:import
npm run auth:create-user -- you@email.com 'your-password' Aden admin
```

### Develop

```bash
# Terminal-friendly: builds web once, then vite + wrangler
npm run build:web
npm run dev:api    # http://localhost:8787
npm run dev:web    # http://localhost:5173 (proxies /api → 8787)
```

Or open the Worker URL directly after `npm run build:web && npm run dev:api` (serves the built SPA + API).

### Deploy

```bash
# One-time secrets
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET

# Ship it
npm run deploy
```

DNS: CNAME `locations` → your Worker (or attach custom domain `locations.aden.website` in the Cloudflare dashboard — `wrangler.toml` already declares it).

After first deploy, point `BETTER_AUTH_URL` / wrangler `[vars]` at `https://locations.aden.website`, re-import if needed, and create your admin user against the **production** `DATABASE_URL`.

### Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run deploy` | Build web + `wrangler deploy` |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:import` | Load gitignored JSON → Neon + analytics |
| `npm run db:warm-routes` | Optional OSRM backfill into `route_cache` |
| `npm run auth:create-user` | Invite a user (no public signup) |

## Privacy

- `location-history.json` and SQLite caches are **gitignored**
- App is `noindex`; demo is invite-only
- Do not publish dumps of coordinates, place IDs, or Neon connection strings

## Legacy

The original FastAPI prototype lives under `legacy/backend` for reference only. Production is Workers + Neon.

## License

MIT — see [LICENSE](LICENSE).

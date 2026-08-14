# API routes

Unauthenticated: `/api/health`, `/api/auth/*`, `POST /api/auth/demo`, `POST /api/billing/webhook`, `GET /api/config` (public tile URL templates only).

All other `/api/*` require a session.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `{ ok, db? }` |
| GET | `/api/me` | user, tenant, entitlements, settings |
| GET | `/api/config` | map tile templates |
| GET | `/api/overview` | tenant summary; query `sourceId`, `from`, `to` |
| GET | `/api/days` | |
| GET | `/api/day/:date` | optional `?stream=1` |
| GET | `/api/heatmap` | |
| GET | `/api/analytics/*` | monthly, yearly, day-trips, corridors, facts |
| GET | `/api/search` | `q=` places/days |
| GET | `/api/sources` | |
| PATCH/DELETE | `/api/sources/:id` | not demo |
| GET | `/api/import/status` | |
| POST | `/api/import` | not demo; entitlement |
| POST | `/api/billing/checkout` | `{ interval: monthly\|yearly }` |
| POST | `/api/billing/portal` | |
| POST | `/api/account/delete` | GDPR wipe |
| GET | `/api/account/export` | JSON dump |
| PATCH | `/api/account/settings` | units, timezone |
| PATCH | `/api/places/labels` | user place names |

Cross-tenant ids return 404. Demo writes return 403.

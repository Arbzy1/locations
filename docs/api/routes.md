# API routes

Unauthenticated: `/api/health`, `/api/auth/*`, `POST /api/auth/demo`, `POST /api/billing/webhook`, `GET /api/config` (public tile URL templates only).

All other `/api/*` require a session.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `{ ok, db? }` |
| GET | `/api/me` | user, tenant, entitlements, settings |
| GET | `/api/config` | map tile templates, `signupDisabled`, `globe` |
| GET | `/api/overview` | tenant summary; query `sourceId`, `from`, `to` |
| GET | `/api/days` | |
| GET | `/api/day/:date` | optional `?stream=1` |
| GET | `/api/heatmap` | |
| GET | `/api/analytics/*` | monthly, yearly, day-trips, corridors, facts, multi-day, home-work, areas, year-in-review (`?year=`), flights, train-hops, low-movement, away-nights, commute, firsts, data-health, moving, anomaly |
| GET | `/api/clusters` | directory; `q`, `sort`, `limit`, `cursor`; hidden omitted |
| GET | `/api/clusters/:key` | summary, hour histogram, related corridors |
| GET | `/api/clusters/:key/visits` | paginated visits |
| GET | `/api/corridors/:a/:b` | transitions; 404 if none |
| GET | `/api/trip-range/:start/:end` | up to 14 days of visits/activities |
| GET/POST | `/api/trips` | named trips; POST not demo |
| PATCH/DELETE | `/api/trips/:id` | not demo; missing 404 |
| GET/POST | `/api/chapters` | life chapters; POST not demo |
| PATCH/DELETE | `/api/chapters/:id` | not demo |
| GET | `/api/import/jobs` | job list without R2 keys |
| GET | `/api/admin/stats` | staff only; own tenant counts; others 404 |
| GET | `/api/search` | `q=` places/days |
| GET | `/api/sources` | |
| PATCH/DELETE | `/api/sources/:id` | not demo |
| GET | `/api/import/status` | |
| POST | `/api/import` | not demo; entitlement |
| POST | `/api/billing/checkout` | `{ interval: monthly\|yearly }` |
| POST | `/api/billing/portal` | |
| POST | `/api/account/delete` | GDPR wipe |
| GET | `/api/account/export` | JSON dump (overview, sources, settings, labels) |
| PATCH | `/api/account/settings` | units, timezone |
| GET | `/api/places/labels` | user place names, hidden, favourite, colour, tags |
| PATCH | `/api/places/labels` | `{ placeKey, label?, hidden?, favourite?, color?, tags? }`; `color` is an allowlisted token; demo 403 |

Cross-tenant ids return 404. Demo writes return 403.

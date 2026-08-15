# API routes

Unauthenticated: `/api/health`, `/api/auth/*`, `POST /api/auth/demo`, `POST /api/billing/webhook`, `GET /api/config` (public tile URL templates only).

All other `/api/*` require a session.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `{ ok, worker, db }` Worker liveness plus a database ping. `db` is `ok` or `error`. No connection strings. |
| GET | `/api/me` | user, tenant, entitlements, settings |
| GET | `/api/config` | map tile/style templates, `customTiles`, `signupDisabled`, `globe`, `billingConfigured`, `flags` (`globe`, `demoTour`, `landing`) |
| GET | `/api/overview` | tenant summary; query `sourceId`, `from`, `to` |
| GET | `/api/days` | |
| DELETE | `/api/days` | `from`, `to`, optional `sourceId`; not demo; rebuilds aggregates |
| GET | `/api/day/:date` | optional `?stream=1`, optional `?sources=` |
| GET | `/api/heatmap` | optional `?sources=` |
| GET | `/api/route-progress` | tenant-scoped cache hits |
| POST | `/api/routes/rewarm` | not demo; cap 100 uncached journeys |
| GET | `/api/analytics/*` | monthly, yearly, day-trips, corridors, facts, multi-day, home-work, areas, year-in-review (`?year=`), flights, train-hops, low-movement, away-nights, commute, firsts, data-health, moving, anomaly, activity-guesses, badges |
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
| GET | `/api/admin/stats` | staff only; own tenant counts, stuck jobs (id/status/age/counts); others 404 |
| GET | `/api/search` | `q=` places (cluster, type, labels, tags) and days; hidden omitted; ISO date is exact |
| GET | `/api/sources` | |
| PATCH/DELETE | `/api/sources/:id` | not demo; PATCH `label` and/or allowlisted `color` |
| GET | `/api/import/status` | includes `chosenFile`, `timezoneWarning` |
| POST | `/api/import/preview` | not demo; entitlement; no R2 |
| POST | `/api/import` | not demo; entitlement; `merge`, `skipOverlappingDays` |
| POST | `/api/billing/checkout` | `{ interval: monthly\|yearly }` |
| POST | `/api/billing/portal` | |
| POST | `/api/account/delete` | GDPR wipe |
| GET | `/api/account/export` | JSON summary (overview, sources, settings, labels) |
| POST | `/api/account/export-pack` | Start GDPR ZIP job; 409 if one is already running |
| GET | `/api/account/export-pack/:jobId` | Job status (no R2 key) |
| GET | `/api/account/export-pack/:jobId/file` | Download ZIP then delete the R2 object |
| PATCH | `/api/account/settings` | units, timezone, recap, map bookmarks, allowlisted custom tiles |
| GET | `/api/places/labels` | user place names, hidden, favourite, colour, tags |
| PATCH | `/api/places/labels` | `{ placeKey, label?, hidden?, favourite?, color?, tags? }`; `color` is an allowlisted token; demo 403 |

Cross-tenant ids return 404. Demo writes return 403.

# API routes

Unauthenticated: `/api/health`, `/api/auth/*`, `POST /api/auth/demo`, `POST /api/billing/webhook`, `GET /api/config` (public tile URL templates only).

All other `/api/*` require a session.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `{ ok, worker, db }` Worker liveness plus a database ping. `db` is `ok` or `error`. No connection strings. |
| GET | `/api/me` | user, tenant, entitlements, settings |
| GET | `/api/config` | map tile/style templates, `customTiles`, `signupDisabled`, `googleAuth`, `globe`, `billingConfigured`, `flags` (`globe`, `demoTour`, `landing`) |
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
| GET | `/api/admin/stats` | staff only; caller tenant counts, stuck jobs (id/status/age/counts, sanitized error); others 404 |
| GET | `/api/admin/overview` | staff; health, flags, attention (stuck/past_due/unverified/admin count), vendor diagnostics booleans |
| GET/PATCH | `/api/admin/flags` | staff GET (env vs db, `updatedBy`/`updatedAt`); admin PATCH overlay on signup/landing/globe/demo tour |
| POST | `/api/admin/flags/reset` | admin; delete overlay row for one key (`flags_reset` audit) |
| GET | `/api/admin/users` | staff; paginated directory (`q`, `role`, `verified`, `billing`, `cursor`, `limit` cap 50); last session time |
| POST | `/api/admin/users` | admin; invite `{ email, name?, role?: user\|developer }`; random password never returned; duplicate 400 |
| GET | `/api/admin/users/:id` | staff; counts, billing (no Stripe ids), quota, grace, sanitized job errors; 404 if missing |
| POST | `/api/admin/users/:id/role` | admin; `user` / `admin` / `developer`; last-admin guard |
| POST | `/api/admin/users/:id/revoke-sessions` | admin |
| POST | `/api/admin/users/:id/verify` | admin; `{ emailVerified }` true or false |
| POST | `/api/admin/users/:id/send-reset` | admin; password reset to the account email; log `{ kind, ok }` only |
| POST | `/api/admin/users/:id/wipe` | admin; body must repeat target email |
| GET | `/api/admin/billing` | staff; status histogram, past_due email/grace/period/interval (`monthly`/`yearly`/`other`, never raw `price_`) |
| GET | `/api/admin/imports` | staff; job ids, counts, sanitized error, account email; `status=stuck\|error\|all` |
| POST | `/api/admin/imports/:userId/jobs/:jobId/fail` | admin; `{ confirm: "stuck" }` fails pending/processing, deletes R2 object; unknown 404; no requeue |
| GET | `/api/admin/exports` | staff; export job ids/status/error; no ZIP download |
| POST | `/api/admin/exports/:userId/jobs/:jobId/fail` | admin; same unlock as imports |
| GET | `/api/admin/email` | staff; kind catalog, `resendConfigured`, last recap `{ considered, sent }` |
| POST | `/api/admin/email/test` | admin; `{ kind: password_changed }` to the **session email only** |
| GET | `/api/admin/maps/probe` | staff; `{ name, ok, status, ms }` per vendor; never URLs, keys, or bodies |
| GET | `/api/admin/maps` | staff; vendor configured booleans and custom host count, never keys |
| GET | `/api/admin/demo` | staff; exists, demo email, demo-tenant visit/source counts; no recreate |
| GET | `/api/admin/analytics` | staff; role counts, unverified exact, entitled/lapsed sampled, signups by week |
| GET | `/api/admin/audit` | staff; action log with scrubbed meta; `action`, `cursor` |
| GET | `/api/admin/diagnostics` | staff; Worker/Neon/flag/vendor booleans |
| GET | `/api/search` | `q=` places (cluster, type, labels, tags) and days; hidden omitted; ISO date is exact; rate-limited |
| GET | `/api/sources` | |
| PATCH/DELETE | `/api/sources/:id` | not demo; PATCH `label` and/or allowlisted `color` |
| GET | `/api/import/status` | includes `chosenFile`, `timezoneWarning` |
| POST | `/api/import/preview` | not demo; entitlement; no R2 |
| POST | `/api/import` | not demo; entitlement; `merge`, `skipOverlappingDays`; 409 if an import is already running |
| POST | `/api/billing/checkout` | `{ interval: monthly\|yearly }`; rate-limited |
| POST | `/api/billing/portal` | rate-limited |
| POST | `/api/account/delete` | GDPR wipe inside `withTenant`; R2 prefixes paged |
| GET | `/api/account/export` | JSON summary (overview, sources, settings, labels) |
| POST | `/api/account/export-pack` | Start GDPR ZIP job; 409 if one is already running |
| GET | `/api/account/export-pack/:jobId` | Job status (no R2 key) |
| GET | `/api/account/export-pack/:jobId/file` | Download ZIP then delete the R2 object |
| PATCH | `/api/account/settings` | units, timezone, recap, map bookmarks, allowlisted custom tiles |
| GET | `/api/places/labels` | user place names, hidden, favourite, colour, tags |
| PATCH | `/api/places/labels` | `{ placeKey, label?, hidden?, favourite?, color?, tags? }`; `color` is an allowlisted token; demo 403 |

Cross-tenant ids return 404. Demo writes return 403.

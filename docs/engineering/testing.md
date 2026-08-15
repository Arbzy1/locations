# Testing

All tests live under [`tests/`](../../tests/README.md). Placement map and decision tree are in that README.

| Script | What |
|--------|------|
| `npm run test:placement` | Fail if a test file is outside `tests/` or in the wrong kind folder |
| `npm run test:unit` | `tests/unit/**/*.test.ts` (pure helpers, no DB/network; excludes security and admin projects) |
| `npm run test:integration` | `tests/integration/**/*.test.ts` (`app.request()` API boundaries; excludes security and admin) |
| `npm run test:admin` | Vitest `admin` project: operator `/api/admin` matrix and developer-check helpers |
| `npm run test:rls` | `tests/rls/**/*.test.ts` (real Postgres FORCE RLS; loads `.env` / `.dev.vars`) |
| `npm run test:security` | Placement + policy scanners + API threat matrix + RLS + `deps:audit`. Not a live pentest. |
| `npm run test:e2e` | Playwright (`tests/e2e/00`–`70`) |
| `npm run test:all` | All Vitest projects (rls skipped if no DB) |
| `npm run test:report` | unit + integration + security; charted markdown at `reports/test-report.md` |
| `npm run loc` / `loc:report` | Lines of code; report writes `reports/loc.md` |

Fixtures: `tests/fixtures/timeline/`. Never commit real Takeout. Do not name a fixture `Records.json`.

Every new route: 401, owner 200, other-tenant 404, demo 403 on writes, under `tests/integration/api/{domain}/`. Also add a row to `tests/helpers/api-route-catalog.ts` so `npm run test:security` stays complete.

Vendor HTTP (mocked Stripe, Resend, Better Auth glue, R2, queues, `/api/health` Neon ping) lives under `tests/integration/api/{billing,auth,email,import,health,places}/`. OSRM/Nominatim `fetch` helpers are unit tests in `tests/unit/api/geo/`. Live Neon isolation stays in `tests/rls/`.

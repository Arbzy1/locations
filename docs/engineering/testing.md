# Testing

All tests live under [`tests/`](../../tests/README.md). Placement map and decision tree are in that README.

| Script | What |
|--------|------|
| `npm run test:placement` | Fail if a test file is outside `tests/` or in the wrong kind folder |
| `npm run test:unit` | `tests/unit/**/*.test.ts` (pure helpers, no DB/network) |
| `npm run test:integration` | `tests/integration/**/*.test.ts` (`app.request()` API boundaries) |
| `npm run test:rls` | `tests/rls/**/*.test.ts` (real Postgres FORCE RLS; needs `DATABASE_URL`) |
| `npm run test:e2e` | Playwright (`tests/e2e/00`–`70`) |
| `npm run test:all` | All Vitest projects (rls skipped if no DB) |
| `npm run test:report` | unit + integration, writes `reports/test-report.md` |
| `npm run loc` / `loc:report` | Lines of code; report writes `reports/loc.md` |

Fixtures: `tests/fixtures/timeline/`. Never commit real Takeout. Do not name a fixture `Records.json`.

Every new route: 401, owner 200, other-tenant 404, demo 403 on writes, under `tests/integration/api/{domain}/`.

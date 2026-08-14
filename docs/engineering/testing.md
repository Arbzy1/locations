# Testing

| Script | What |
|--------|------|
| `npm run test:unit` | Pure helpers, no DB/network |
| `npm run test:integration` | `app.request()` API boundaries |
| `npm run test:rls` | Real Postgres FORCE RLS (needs `DATABASE_URL`) |
| `npm run test:e2e` | Playwright (`e2e/00`–`70`) |
| `npm run test:all` | unit + integration (rls skipped if no DB) |
| `npm run test:report` | unit + integration, writes `reports/test-report.md` |
| `npm run loc` / `loc:report` | Lines of code; report writes `reports/loc.md` |

Fixtures: `packages/db/src/timeline-import/fixtures/`. Never commit real Takeout.

Every new route: 401, owner 200, other-tenant 404, demo 403 on writes.

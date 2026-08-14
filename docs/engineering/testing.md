# Testing

| Script | What |
|--------|------|
| `npm run test:unit` | Pure helpers, no DB/network |
| `npm run test:integration` | `app.request()` API boundaries |
| `npm run test:rls` | Real Postgres FORCE RLS (needs `DATABASE_URL`) |
| `npm run test:e2e` | Playwright (`e2e/00`–`70`) |
| `npm run test:all` | unit + integration (rls skipped if no DB) |

Fixtures: `packages/db/src/timeline-import/fixtures/`. Never commit real Takeout.

Every new route: 401, owner 200, other-tenant 404, demo 403 on writes.

# helpers

Shared test harness only. Never put `*.test.ts` or `*.spec.ts` here.

- `env.ts`: mock Worker `Env` and `ExecutionContext`
- `api-app.ts`: `sessionUser`, services mock factory, `app.request` wrapper
- `fixtures.ts`: load synthetic Timeline JSON from `tests/fixtures/timeline/`
- `rls-env.ts`: load `.env` / `.dev.vars` for live Postgres RLS tests (`DATABASE_URL`)

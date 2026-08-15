# helpers

Shared test harness only. Never put `*.test.ts` or `*.spec.ts` here.

- `env.ts`: mock Worker `Env` and `ExecutionContext`
- `api-app.ts`: `sessionUser`, services mock factory, `app.request` wrapper
- `vendors.ts`: Stripe / R2 queue / Resend `fetch` stubs for integration suites
- `fixtures.ts`: load synthetic Timeline JSON from `tests/fixtures/timeline/`
- `api-route-catalog.ts`: canonical `/api/*` route rows for `test:security`
- `tenant-tables.ts`: FORCE RLS tenant table list (must match schema)
- `walk-source.ts`: source walker for policy scanners
- `rls-env.ts`: load `.env` / `.dev.vars` for live Postgres RLS tests (`DATABASE_URL`)

# rls

Live Postgres FORCE RLS. Loads `DATABASE_URL` from the environment, then `.env` / `.dev.vars` (same as `db:migrate`). Skip if still unset; CI must set the secret and run it.

Leak and WITH CHECK assertions run as `locations_app` (NOBYPASSRLS). If `DATABASE_URL` is a BYPASSRLS owner, tests GRANT that role and `SET LOCAL ROLE` for those cases. Skip only when the URL is missing or `locations_app` does not exist.

`npm run test:rls` runs `tests/rls/**/*.test.ts`.

| Leaf | What |
| --- | --- |
| `isolation/` | Leak tests: other-tenant rows hidden even without Drizzle `eq(tenant)` |
| `with-check/` | Insert whose `tenant` column differs from the GUC is rejected |
| `empty-guc/` | Unset / empty `app.tenant` matches nothing (fail closed) |

Do not put no-DB `withTenant` unit cases here; those live in `tests/unit/db/with-tenant/`.

# rls

Live Postgres FORCE RLS. Needs `DATABASE_URL`. Skip locally if unset; CI must run it.

`npm run test:rls` runs `tests/rls/**/*.test.ts`.

| Leaf | What |
| --- | --- |
| `isolation/` | Leak tests: other-tenant rows hidden even without Drizzle `eq(tenant)` |
| `with-check/` | Insert whose `tenant` column differs from the GUC is rejected |
| `empty-guc/` | Unset / empty `app.tenant` matches nothing (fail closed) |

Do not put no-DB `withTenant` unit cases here; those live in `tests/unit/db/with-tenant/`.

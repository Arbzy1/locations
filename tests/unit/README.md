# unit

Pure helpers. No network, no live Postgres, no `app.request()`.

`npm run test:unit` runs `tests/unit/**/*.test.ts`.

| Layer | Path | Source |
| --- | --- | --- |
| API | `api/{domain}/` | `apps/api/src` |
| DB | `db/{domain}/` | `packages/db/src` |
| Web | `web/{domain}/` | `apps/web/src` |
| Scripts | `scripts/{domain}/` | `scripts/` |

Mocked Drizzle chains belong here (not integration). HTTP against the Hono `app` belongs in `tests/integration/`.

# Tests

All automated tests live here. Do not colocate `*.test.ts` or `*.spec.ts` next to source under `apps/`, `packages/`, or `scripts/`. Directory is the classifier: drop `*.integration.test.ts` / `*.rls.test.ts` suffixes.

Canonical map for agents. `npm run test:placement` fails CI if a test file is outside this tree or in the wrong kind folder.

## Decision tree

1. Playwright against a running app (`page` / `request` to `PLAYWRIGHT_BASE_URL`) -> [`e2e/`](e2e/)
2. Needs live Postgres (`DATABASE_URL`, FORCE RLS leak / WITH CHECK / empty GUC) -> [`rls/`](rls/)
3. `app.request()` or webhook HTTP with mocked Stripe/R2/auth -> [`integration/`](integration/)
4. Pure helpers, mocked Drizzle, no HTTP app -> [`unit/`](unit/)

Inventing a new leaf: add it under the matching kind/layer/domain. Never next to source. Do not add a folder per product idea; only for a domain that has (or is about to have) tests.

## Layout

```text
tests/
  helpers/          shared harness only (never *.test.ts)
  fixtures/         synthetic data only (never real Takeout)
  unit/             npm run test:unit
    api/            apps/api helpers
    db/             packages/db helpers
    web/            apps/web helpers
    scripts/        repo scripts
  integration/      npm run test:integration
    api/            Hono app.request and webhook HTTP
  rls/              npm run test:rls (live DATABASE_URL)
  e2e/              npm run test:e2e (Playwright, *.spec.ts)
```

Filenames: Vitest is `*.test.ts`. Playwright is `*.spec.ts`.

## Where to put a new test

| Kind | Path | Examples |
| --- | --- | --- |
| Unit, API helper | `unit/api/{domain}/` | cors, rate-limit, unzip, place colour, email templates |
| Unit, DB helper | `unit/db/{domain}/` | geo, entitlements, timeline parse, withTenant no-DB |
| Unit, web helper | `unit/web/{domain}/` | hotspots ranking, formatDistance |
| Unit, script | `unit/scripts/{domain}/` | env-file upsert, cf:sync secret keys |
| Integration, route | `integration/api/{domain}/` | 401 / owner 200 / cross-tenant 404 / demo 403 |
| Integration, Stripe webhook | `integration/api/billing/` | invalid signature, replay, grant/revoke |
| RLS leak | `rls/isolation/` | FORCE RLS without Drizzle tenant filters |
| RLS WITH CHECK | `rls/with-check/` | insert whose `tenant` differs from GUC |
| RLS empty GUC | `rls/empty-guc/` | fail closed when `app.tenant` is unset |
| E2E | `e2e/NN-domain.spec.ts` | keep the numbered prefix |

Every new API route needs positive + unauthenticated + cross-tenant + demo-denied coverage under `integration/api/{domain}/`. Schema changes that add tenant tables need an RLS leak test under `rls/isolation/`.

## Imports

Vitest aliases (see `vitest.config.ts`):

- `@locations/db` -> `packages/db/src/index.ts`
- `@locations/api` -> `apps/api/src`
- `@locations/web` -> `apps/web/src`
- `@tests` -> `tests/`

`vi.mock` must use those aliases (`@locations/api/auth`, not `./auth`). Relative mocks bind to the test file, not the Worker source.

## Fixtures

Tiny synthetic Timeline JSON only: [`fixtures/timeline/`](fixtures/timeline/). Never commit real Takeout. Do not name a fixture `Records.json` (gitignore).

## Commands

| Script | What |
| --- | --- |
| `npm run test:placement` | Fail if tests live outside this tree |
| `npm run test:unit` | `tests/unit/**/*.test.ts` |
| `npm run test:integration` | `tests/integration/**/*.test.ts` |
| `npm run test:rls` | `tests/rls/**/*.test.ts` (skipIf without `DATABASE_URL`) |
| `npm run test:e2e` | Playwright `tests/e2e` |
| `npm run test:all` | All Vitest projects |
| `npm run test:report` | unit + integration markdown report |

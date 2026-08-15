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
    security/       policy scanners, catalog drift, privacy/XSS (`test:security`)
  integration/      npm run test:integration
    api/            Hono app.request and webhook HTTP
      security/     route threat matrix (`test:security`)
  rls/              npm run test:rls (live DATABASE_URL)
  e2e/              npm run test:e2e (Playwright, *.spec.ts)
```

Filenames: Vitest is `*.test.ts`. Playwright is `*.spec.ts`.

## Where to put a new test

| Kind | Path | Examples |
| --- | --- | --- |
| Unit, API helper | `unit/api/{domain}/` | cors, rate-limit, unzip, place colour, email templates, OSRM/Nominatim fetch |
| Unit, DB helper | `unit/db/{domain}/` | geo, entitlements, timeline parse, withTenant no-DB |
| Unit, web helper | `unit/web/{domain}/` | hotspots ranking, formatDistance |
| Unit, script | `unit/scripts/{domain}/` | env-file upsert, cf:sync secret keys |
| Integration, route | `integration/api/{domain}/` | 401 / owner 200 / cross-tenant 404 / demo 403 |
| Integration, Stripe webhook | `integration/api/billing/` | invalid signature, replay, grant/revoke, Checkout/Portal |
| Integration, auth vendors | `integration/api/auth/` | demo login, change-password/email hooks |
| Integration, email | `integration/api/email/` | Resend product mail, monthly recap Worker entry |
| Integration, import storage | `integration/api/import/` | R2 put/delete, queue consumer |
| Integration, health | `integration/api/health/` | public ping, mocked Neon `db` flag |
| Unit, security catalog | `unit/security/` | sql.raw, VITE_, CSP, auth cookies, email/XSS, hide-place |
| Integration, security matrix | `integration/api/security/` | every route 401 / demo 403 / 404 / 429 / headers |
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
| `npm run test:unit` | `tests/unit/**/*.test.ts` except `tests/unit/security/` (that project is `test:security`) |
| `npm run test:integration` | `tests/integration/**/*.test.ts` except `tests/integration/api/security/` |
| `npm run test:rls` | `tests/rls/**/*.test.ts` (loads `.env` / `.dev.vars`; skipIf without `DATABASE_URL`) |
| `npm run test:security` | Placement, Vitest `security` project, RLS, `deps:audit`. Not a live pentest. |
| `npm run test:e2e` | Playwright `tests/e2e` |
| `npm run test:all` | All Vitest projects |
| `npm run test:report` | unit + integration + security; charted markdown report |

A new `/api/*` route without a row in [`helpers/api-route-catalog.ts`](helpers/api-route-catalog.ts) fails `test:security`.

`test:security` is a catalog regression suite, not a live pentest. It does not cover Cloudflare WAF / Rate Limiting dashboard config, live Stripe charges, staging/prod traffic, proving Wrangler `DATABASE_URL` is not BYPASSRLS, or WebAuthn / per-email KV lockout (not built yet).

Production `npm audit --omit=dev` currently reports drizzle-orm identifier escaping (`GHSA-gpj5-g38j-94v9`; this repo does not interpolate SQL identifiers from user input, and the sql.raw scanner covers `migrate.ts`) and nanoid via a Better Auth plugin test path (`GHSA-2v37-7h3g-55p8`). Those two are documented in the runner. Any other high/critical in production deps fails the suite. `npm run deps:audit` remains the full-tree audit (includes dev tooling).

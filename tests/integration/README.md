# integration

`app.request()` and webhook HTTP. Mock Stripe, R2, auth, and services. No live Postgres.

`npm run test:integration` runs `tests/integration/**/*.test.ts`.

Every new `/api/*` route: unauthenticated 401, owner 200, other-tenant 404 (not 403), demo 403 on writes. Put that coverage under `api/{domain}/`. Stripe webhook: invalid signature, replay, entitlement grant/revoke under `api/billing/`.

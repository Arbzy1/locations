# e2e

Playwright against a running API (`PLAYWRIGHT_BASE_URL`, default `http://127.0.0.1:8787`). Files are `*.spec.ts` only.

Keep the numbered prefix so docs and sort order stay stable: `00-health` through `70-tenancy`.

Typical local flow: `npm run build:web`, `npm run dev:api`, then `npm run test:e2e`.

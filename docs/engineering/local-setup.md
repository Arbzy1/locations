# Local setup

```bash
npm install
npm run setup:project
npm run build:web
npm run dev:api
```

Optional: `npm run dev:web` for Vite HMR (proxies `/api` to 8787).

Secrets in `.dev.vars`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, optional `RESEND_API_KEY`, `STRIPE_*`, `DEMO_EMAIL`, `DEMO_PASSWORD`.

See the root [README](../../README.md).

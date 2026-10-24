# Architecture

```
Browser ──► Cloudflare Worker (/api/* and page routes; /assets/* served directly)
   │            │   staging: locations-staging (deploys on push to master)
   │            │   production: locations (manual "Deploy production" workflow)
   │            │
   │            ├── Better Auth session cookie
   │            ├── Stripe webhooks (signed)
   │            ├── Neon Postgres (FORCE RLS + Drizzle tenant filters)
   │            ├── OSRM / Nominatim (after the tenant transaction, capped per request)
   │            ├── R2 + import queue (legacy server-side upload import)
   │            └── one cron (*/20): Journey cost data sync; monthly jobs on the 1st
   │
   └── Web Worker: parses Timeline exports, detects transport modes against static
       rail tiles (/assets/rail), computes statistics; uploads small checked batches
```

The Worker runs on the Cloudflare free plan (10 ms CPU and 50 subrequests per request, 5 cron triggers per account), so heavy work happens in the browser. See [import pipeline](import-pipeline.md).

| Piece | Where |
|-------|--------|
| SPA | `apps/web` (Vite, Tailwind 4, shadcn, Motion, MapLibre) |
| API | `apps/api/src/index.ts` (Hono); browser import and aggregate writes in `import-session.ts` |
| Schema | `packages/db/src/schema.ts` |
| Timeline parse (shared, browser-safe) | `packages/db/src/timeline-parse.ts` via `@locations/db/pure` |
| Transport mode detection | `packages/db/src/rail.ts` |
| Statistics | `packages/db/src/aggregates.ts`, `analytics.ts` |
| CLI import | `packages/db/src/timeline-import.ts`, `import.ts` |
| Journey cost | `packages/brim`, `apps/api/src/brim/` ([architecture](journey-cost.md)) |
| Tenant GUC | `packages/db/src/with-tenant.ts` |

Authenticated API work runs inside `withTenant()` so `app.tenant` is set for RLS.

Public SPA routes (no app shell): `/` landing, `/pricing`, `/status`, `/changelog`, plus Privacy, Terms, and Cookies. Feature flags, `googleAuth`, and tile templates come from `GET /api/config`.

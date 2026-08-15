# Architecture

```
Browser ──► Cloudflare Worker (static assets + /api/*)
                │   staging: locations-staging
                │   production: locations
                │
                ├── Better Auth session cookie
                ├── Stripe webhooks (signed)
                ├── R2 uploads (Takeout JSON)
                ├── Import queue consumer
                └── Neon Postgres (FORCE RLS + Drizzle tenant filters)
```

| Piece | Where |
|-------|--------|
| SPA | `apps/web` (Vite, Tailwind 4, shadcn, Motion, MapLibre) |
| API | `apps/api/src/index.ts` (Hono) |
| Schema | `packages/db/src/schema.ts` |
| Import parse | `packages/db/src/timeline-import.ts` |
| Tenant GUC | `packages/db/src/with-tenant.ts` |

Authenticated API work runs inside `withTenant()` so `app.tenant` is set for RLS.

Public SPA routes (no app shell): `/` landing, `/pricing`, `/status`, `/changelog`, plus Privacy, Terms, and Cookies. Feature flags and tile templates come from `GET /api/config`.

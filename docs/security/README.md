# Security catalog

Location history is precise geolocation over years. Treat a leak as catastrophic.

Keep Drizzle tenant filters **and** FORCE RLS. Full classes:

## Access control

- Tenant only from the session. Cross-tenant → 404.
- Demo cannot import, rename, delete sources, or mutate billing.
- `user.role` is server-only. Job updates are tenant-scoped.
- Hide-place is discovery only (heatmap, search, directory). Day View still returns visits.
- Account delete must run inside `withTenant` so FORCE RLS actually deletes Timeline rows.

## Auth

- Verified email before import (always on, including when signup is disabled). Session cookies HttpOnly, Secure on HTTPS, SameSite=Lax.
- Password reset and email change revoke other sessions. Email OTPs are stored hashed (3 attempts). Better Auth 1.6.
- Rate-limit `/api/auth/*`, `/api/import`, `/api/search`, `/api/billing/checkout`, `/api/billing/portal`, and `/api/place/:id` in the Worker. Those in-memory maps are **per isolate** and are a backstop only.
- In production, add Cloudflare Rate Limiting / WAF rules for the same paths (and `/api/auth/demo`). Dashboard WAF is the hard edge control.
- Demo password lives in Worker env, not the JS bundle.
- CORS allowlist is `BETTER_AUTH_URL` only in staging/production. Localhost origins are added only when that URL is loopback.

## Headers and XSS

- Enforcing CSP in staging and production (`CSP_ENFORCE=true`). Map popup HTML must escape labels.
- No `dangerouslySetInnerHTML` for user/OSM text.
- Auth JSON and Set-Cookie responses use `Cache-Control: no-store`.
- Staging/production Workers use custom domains; `workers_dev` and `preview_urls` are off there.

## Uploads

- Size/quota, JSON sniff (including after zip extract), bounded zip (entry count while listing, uncompressed cap), server-generated R2 keys, delete after parse.
- One active import job per tenant (409 if pending/processing).

## Stripe

- Verify webhook signatures, idempotent event ids, re-fetch subscription state. No client `customerId`.
- Tenant for webhooks comes from signed Stripe metadata / `client_reference_id` (or the retrieved subscription metadata). Do not look up `subscriptions` under an empty GUC.

## Privacy

- No coordinates, place names, or Takeout paths in logs, email, or error trackers.

## Database role

- Worker `DATABASE_URL` must be `locations_app` (NOBYPASSRLS) with table GRANTs. A BYPASSRLS owner URL makes Drizzle filters the only barrier. `npm run test:rls` checks FORCE flags and fail-closed empty GUC when the connected role cannot bypass RLS.

## Automated catalog (`npm run test:security`)

Encodes this catalog as failing checks: static policy scanners, a complete API threat matrix, FORCE RLS leak tests, privacy/XSS assertions, and `npm audit --audit-level=high`. It is not a live pentest. Out of scope: WAF dashboard config, live Stripe charges, staging/prod traffic, WebAuthn.

## Process

- MFA on GitHub, Cloudflare, Neon, Stripe. Pen test before paid GA.

See also [checklist](checklist.md), [threat model](threat-model.md), [incident response](incident-response.md).

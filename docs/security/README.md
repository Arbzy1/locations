# Security catalog

Location history is precise geolocation over years. Treat a leak as catastrophic.

Keep Drizzle tenant filters **and** FORCE RLS. Full classes:

## Access control

- Tenant only from the session. Cross-tenant → 404.
- Demo cannot import, rename, delete sources, or mutate billing.
- `user.role` is server-only. Job updates are tenant-scoped.

## Auth

- Verified email before import. Session cookies HttpOnly, Secure on HTTPS, SameSite=Lax.
- Rate-limit `/api/auth/*` at the Worker and prefer Cloudflare WAF in production.
- Demo password lives in Worker env, not the JS bundle.

## Headers and XSS

- Enforcing CSP in production (`CSP_ENFORCE=true`). Map popup HTML must escape labels.
- No `dangerouslySetInnerHTML` for user/OSM text.

## Uploads

- Size/quota, JSON sniff, bounded zip, server-generated R2 keys, delete after parse.

## Stripe

- Verify webhook signatures, idempotent event ids, re-fetch subscription state. No client `customerId`.

## Privacy

- No coordinates in logs, email, or error trackers.

## Process

- MFA on GitHub, Cloudflare, Neon, Stripe. Pen test before paid GA.

See also [checklist](checklist.md), [threat model](threat-model.md), [incident response](incident-response.md).

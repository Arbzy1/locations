# Privacy Policy

Last updated: 15 August 2026

Locations (“we”) provides a hosted map journal for **your** Google Timeline export.

## What we collect

- Account: email, name, password hash, session metadata
- Timeline: visits, activities, inferred place names, travel modes, source labels
- Billing: Stripe customer and subscription ids (card data stays with Stripe)
- Uploads: Takeout JSON/zip stored briefly on R2 then deleted after parse
- Export packs: ZIP of your Timeline stored briefly on R2 then deleted after download

We do not sell location data. We do not put coordinates, place names, day routes, or Takeout payloads in email. Mail is transactional only (verify, reset, magic link, OTP, import status, billing status, account deleted). There is no marketing list. See the product [email catalog](../product/email.md).

## Legal basis (UK GDPR)

Contract (providing the service) and legitimate interests (security, fraud). Precise location is provided by you as the export owner.

## Retention

Active account: until you delete it. Account delete runs inside the tenant GUC (FORCE RLS) so Timeline rows, labels, jobs, and settings are actually erased, then auth rows and verification tokens. Import files: deleted after parse or via R2 lifecycle (prefix delete pages until empty). Export packs: deleted after download. Backups: limited TTL on Neon.

## Your rights

Access, rectification, erasure, a JSON summary (`GET /api/account/export`), a GDPR pack ZIP from Settings (visits and activities; download only, never emailed), objection. Email the privacy contact on the site.

## Children

Not for under 16.

## Subprocessors

See [subprocessors](../security/subprocessors.md).

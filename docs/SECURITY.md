# Locations Security

Working security checklist for this app (React 19 + Vite, Hono on Cloudflare Workers, Neon + Drizzle, Better Auth). Full industry class coverage is summarized below; stack notes are specific to this repo.

**Not in this product today:** Stripe, Resend, inbound/outbound webhooks. When those are added, follow the "When payments / email / webhooks are added" section.

**Tenancy model:** isolation is **application-level** (`tenant` column + Drizzle `eq(...tenant, tenant)`). There is **no Postgres RLS** yet. A missed filter is a real leak. RLS remains a planned backstop, not a current control.

No document is exhaustive. Business-logic flaws are domain-specific. Treat this as a living checklist.

---

## Non-negotiables (agents and humans)

1. Scope every data query by `tenant` derived from the session (`tenantForUser`). Never trust a client-supplied tenant or user id for authorization.
2. Never use `sql.raw()` (or string-built SQL) with user input. Prefer Drizzle `eq` / parameterized `sql\`...\``.
3. Never reflect arbitrary CORS `Origin` values. Use the allowlist in `apps/api/src/cors.ts`.
4. No secrets in the Vite bundle or `VITE_*` env vars. Enforcement lives on the API.
5. Demo role cannot import or mutate sources (`blockDemo`).
6. Cross-tenant resource access returns **404**, not 403.
7. Signup stays invite-only (`disableSignUp: true`).

See also [AGENTS.md](../AGENTS.md).

---

## Vulnerability classes (summary + Locations notes)

### 1. Injection

- **SQL:** use Drizzle; flag `sql.raw` in review (migrate tooling only today).
- **NoSQL / command / template:** N/A at the Worker edge (no shell). Validate JSON uploads as data, not code.
- **Header / log injection:** prefer structured JSON logs; strip control characters if logging user fields.

### 2. XSS

- React text escaping is the default. Avoid `dangerouslySetInnerHTML`.
- Leaflet `innerHTML` / `divIcon` HTML must escape untrusted place names and labels.
- CSP ships in **Report-Only** first (`Content-Security-Policy-Report-Only`). Enforce after fixing violations.
- Session cookies are HttpOnly so XSS cannot read the token directly (authenticated requests are still possible).

### 3. Broken authentication

Better Auth handles hashing and session cookies. We still own:

- Explicit cookie attributes (`httpOnly`, `sameSite: lax`, `secure` when HTTPS).
- Rate limits on `/api/auth/*` and expensive routes.
- Invite-only signup; no public registration.
- Future: breached-password checks, MFA on sensitive actions.

### 4. Broken access control

- Every read/write path uses session `tenant`.
- Source get/rename/delete/import keyed by `tenant` + id.
- **Gap:** Postgres RLS not enabled. Tracked as follow-up.
- UUID job/source ids are defence-in-depth, not authorization.

### 5. CSRF

- Cookie sessions + `SameSite=Lax`.
- CORS allowlist (not `*`).
- No state-changing GETs.

### 6. SSRF

- No user-supplied fetch URLs today. OSRM/geocode hosts are fixed server-side.
- If "import from URL" is added: allowlist hosts, block private IPs after DNS, no raw response echo.

### 7. Cryptographic / sensitive data

- TLS at the edge (Cloudflare). HSTS on production API/HTML responses.
- Secrets via `wrangler secret` / `.dev.vars`, never committed.
- Prefer `crypto.randomUUID()` for ids (already used for import jobs).

### 8. Security misconfiguration

- Generic JSON errors to clients; no stack traces in responses.
- Debug/sample routes must not ship on the public Worker.
- Staging credentials must differ from production.

### 9. Supply chain

- Lockfile committed; use `npm ci` in any future CI.
- Run `npm run deps:audit` locally before releases (exits non-zero on high/critical).
- As of this hardening pass, audit reports known issues in pinned `better-auth` and `drizzle-orm` versions. Schedule version bumps as a follow-up (test auth + migrations after upgrading). Automate in CI when CI exists.

### 10-11. Deserialization / XXE

- JSON only for timeline uploads. No XML/SAML parsers in-app.
- Reject zip/mbox. Sniff JSON before accepting uploads.

### 12-13. Security headers / clickjacking

Set globally in the Worker (API + asset responses):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera/mic/geo off)
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- `Strict-Transport-Security` on HTTPS production
- `Cache-Control: no-store` on `/api/*` (except health if desired)

### 14. Open redirect

- No open redirect helper today. If added: relative paths only or server-side allowlist.

### 15. File upload

`POST /api/import`:

- Max 80MB; server-generated R2 key `uploads/{userId}/{jobId}.json`
- Demo blocked; tenant-scoped source
- Reject zip/mbox by name; require JSON parse / leading sniff before store
- Rate limited per identity/IP
- Stored on R2 (not served as app origin HTML)

### 16. Rate limiting / DoS

- In-Worker fixed-window limits on auth and import (see `rate-limit.ts`).
- Production should also use Cloudflare Rate Limiting / WAF rules (edge).
- Cap upload size; avoid unbounded query `limit` params if introduced.

### 17. Business logic

- Import replaces source data for that tenant/source. Abuse: repeated large uploads (mitigated by rate limit + size cap).
- Demo cannot mutate. Invite-only accounts.

### 18. Race conditions

- Import jobs are async; status updates are best-effort. Financial-style idempotency N/A today.
- Prefer DB constraints for any future unique "one active X" rules.

### 19. CORS

Allowlist exact origins: `BETTER_AUTH_URL` + local Vite/API hosts. Never `origin => origin`.

### 20. Webhooks (when added)

**Inbound (e.g. Stripe):** verify signature on raw body, constant-time compare, timestamp skew, store event ids for idempotency, re-fetch authoritative state for money moves.

**Outbound (user URLs):** SSRF controls; sign payloads; send ids not secrets.

**Email (e.g. Resend):** structured API fields only; no raw header concatenation.

### 21-22. Frontend / API

- Client validation is UX only.
- `rel="noopener noreferrer"` on external `target="_blank"`.
- Return explicit API response shapes; do not dump full DB rows with secrets.
- Inventory routes in `apps/api/src/index.ts`.

### 23-24. DNS / cache

- Avoid dangling CNAMEs; do not scope cookies to parent domain unless every subdomain is trusted.
- Authenticated API: `Cache-Control: no-store`. Review Cloudflare cache rules so auth HTML is never cached by extension tricks.

### 25. Logging / IR

Log (when observability is wired): auth success/failure, 401/403 spikes, import start/fail, admin/user create. Scrub secrets/PII. Keep ability to rotate `BETTER_AUTH_SECRET` and revoke sessions.

### 26. Human / process

MFA on GitHub, Cloudflare, registrar, Neon. Pre-commit secret scanning. Rotate any secret that hits git history.

---

## Prioritized retrofit status

| Priority | Item | Status |
|----------|------|--------|
| 1 | Access control / tenant filters | Enforced in app; RLS deferred |
| 2 | Auth hardening + rate limits | Cookie attrs + Worker rate limits |
| 3 | Security headers + CSP Report-Only | Middleware + asset wrapper |
| 4 | Injection / XSS sinks | Drizzle + escaped Leaflet HTML |
| 5 | Webhooks | N/A until Stripe/etc. |
| 6 | Secrets + `deps:audit` | gitignore + npm script |
| 7 | Rate limiting | Auth + import |
| 8 | Logging/alerting | Documented; full stack deferred |
| 9 | Upload hardening | Size, type sniff, R2 keys |
| 10 | Business-logic abuse | Demo block + import notes |

---

## Testing habits

- Negative tests: other user / demo cannot do X (`npm run test:unit`).
- `npm run deps:audit` before releases.
- Manual review for auth, uploads, multi-tenancy.
- Pen test before handling significant third-party personal data beyond the owner's own Takeout.

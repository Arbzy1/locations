# Security PR checklist

- [ ] Tenant from session only; Drizzle filter present
- [ ] New tenant table has FORCE RLS + policy + leak test
- [ ] Cross-tenant id → 404
- [ ] Demo cannot mutate
- [ ] No `sql.raw` with user input
- [ ] No `VITE_*` secrets
- [ ] Uploads: size, sniff (including after zip), server key, one active import
- [ ] Stripe: signature + idempotency if webhook changed; tenant from signed metadata
- [ ] No coordinates or Takeout paths in logs
- [ ] New `/api/*` route has session (unless health/webhook/auth)
- [ ] Webhook uses Stripe signature, not session cookies
- [ ] Account delete / wipe runs inside `withTenant`
- [ ] Rate-limit new expensive routes in-process and note Cloudflare WAF

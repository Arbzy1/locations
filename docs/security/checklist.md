# Security PR checklist

- [ ] Tenant from session only; Drizzle filter present
- [ ] New tenant table has FORCE RLS + policy + leak test
- [ ] Cross-tenant id → 404
- [ ] Demo cannot mutate
- [ ] No `sql.raw` with user input
- [ ] No `VITE_*` secrets
- [ ] Uploads: size, sniff, server key
- [ ] Stripe: signature + idempotency if webhook changed
- [ ] No coordinates in logs
- [ ] New `/api/*` route has session (unless health/webhook/auth)
- [ ] Webhook uses Stripe signature, not session cookies

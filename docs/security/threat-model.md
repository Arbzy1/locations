# Threat model

## Assets

Years of GPS, inferred home/work, Google account labels, auth cookies, Stripe customer ids, raw Takeout in R2.

## Adversaries

Anonymous internet, other tenants, stolen session, stolen `DATABASE_URL`, compromised demo account, webhook forger, cost-DoS via import/OSRM.

## Mitigations

FORCE RLS, session tenant, demo write-block, signed Stripe webhooks, upload caps, queue timeouts, edge rate limits, no PII logs.

## Residual risk

A BYPASSRLS database URL in Wrangler bypasses RLS. Keep app and migrator credentials separate.

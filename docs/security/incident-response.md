# Incident response

1. Rotate `BETTER_AUTH_SECRET` (mass logout), `DATABASE_URL` if leaked, Stripe webhook secret, R2 tokens.
2. Revoke sessions in `session` table for affected users.
3. If location data leaked: notify affected users and the ICO within 72 hours when UK GDPR applies.
4. Post on the status page. Do not email raw coordinates as “proof”.
5. Write a timeline: detection, containment, eradication, recovery.

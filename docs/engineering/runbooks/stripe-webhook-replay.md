# Stripe webhook replay

1. In Stripe Dashboard, resend the event.
2. `stripe_events` primary key ignores duplicates (idempotent).
3. If entitlement is wrong, retrieve the subscription with the secret key and upsert `subscriptions`.
4. Never grant access from the event payload alone without a retrieve.

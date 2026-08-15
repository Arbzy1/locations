# Restore a tenant

1. Identify `tenant` (user id or `demo`).
2. Restore Neon PITR to a branch; copy rows for that tenant only.
3. Do not restore another tenant’s `visits`.
4. Rebuild `day_stats` / `analytics_cache` via re-import or `rebuildTenantAggregates`.

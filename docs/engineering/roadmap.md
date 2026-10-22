# Roadmap (from the October 2026 audit)

Three read-only audits (UX/layout, product, performance/reliability) fed this plan. Work lands in phases; each phase is shippable on its own. Tick items as they merge.

## Phase 1 - Quick wins

- [ ] Day summary says "Stayed at X all day" on days with journeys (`Timeline.tsx`).
- [ ] Import status says "1 records parsed" for Timeline.json, Edits and Records.json (`index.ts` parsedCount).
- [ ] Route cache progress: same key logic as rewarm (trace keys for GPS journeys), distinct keys, tenant-only, fetched on Settings only.
- [ ] Upload size limit shown before upload, checked client-side (`ImportDropZone.tsx`, `quotas.ts`).
- [ ] Shared demo login: no session list/revoke (other visitors' IP and user agent), no export-pack jobs.
- [ ] Bottom nav: distinct short labels ("Day" vs "Trips").
- [ ] Timeouts on every OSRM and Nominatim fetch.
- [ ] Refresh location queries when an import job reaches `ready`.
- [ ] Hide the minimap while a bottom-left overlay (playback, Routes actions) is shown.
- [ ] Demo tour no longer ends on a blank Settings page.

## Phase 2 - Speed and reliability

- [ ] `getDay`: read rows in a short `withTenant`, then route/geocode outside the transaction; shared caches written with the HTTP driver; live `resolveCoords` capped and paced; abort on client disconnect.
- [ ] Close the per-request Neon `Pool` (`waitUntil(pool.end())`).
- [ ] Imports: stale `processing` jobs fail after 15 minutes; aggregates select only the columns they need (no `activities.path`).
- [ ] Rewarm capped to a small batch per request.
- [ ] Heatmap: cache settlement misses; no live geocoding on every load.
- [ ] Day View error state with a retry, not "No data for this date".

## Phase 3 - Data correctness

- [ ] Import only leaf visits (Timeline `hierarchyLevel`), so nested stays are not double counted.
- [ ] Records.json and Timeline Edits raw signals feed GPS paths and stay detection instead of 2-minute fake visits.
- [ ] Home/work, away nights, commute and moving history use the user's timezone.
- [ ] Real places: a `place_key` per visit (Google placeId, else a snapped coordinate key); places directory, labels, search and Day View use it; the 0.5 degree grid becomes a region rollup only.
- [ ] Legacy Takeout "Semantic Location History" (`timelineObjects`) parser, all monthly files merged, Google place names kept per tenant.

## Phase 4 - Layout

- [ ] Five primary tabs: Map (Heat / Lines), Days, Trips, Places, Insights; account items at the bottom of the rail; Admin once, staff only.
- [ ] One page template: `w-96` panel with sticky header and "Filters (n)" toggle; `CatalogPage` with breadcrumb; shared Skeleton / EmptyState / ErrorState with `destructive` tokens.
- [ ] Map overlay corners fixed (top-right Layers, bottom-right zoom/legend, bottom-left playback/actions); desktop map tools collapsed into "Layers".
- [ ] One onboarding/no-data screen with the drop zone.
- [ ] Plain-language copy: Pricing, changelog, Day View loading, catalog captions; billing badge words.
- [ ] Theme fixes (hardcoded reds/hex), minimum text size, `inert` on closed drawers, mobile "More" as a Sheet.

## Phase 5 - Features

- [ ] Insights for any date range, and this year vs last.
- [ ] Privacy: delete everything at a place, auto-delete after N years, home blur in exports.
- [ ] Visit notes and mode correction (tenant overrides applied in Day View).
- [ ] GPX / GeoJSON / visits CSV export.
- [ ] Use Timeline `timelineMemory` (seed named trips) and Google's own home/work.
- [ ] "On this day" email instead of the monthly recap.

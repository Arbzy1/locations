# Roadmap (from the October 2026 audit)

Three read-only audits (UX/layout, product, performance/reliability) fed this plan. Work lands in phases; each phase is shippable on its own. Tick items as they merge.

## Phase 1 - Quick wins

- [x] Day summary says "Stayed at X all day" on days with journeys (`Timeline.tsx`).
- [x] Import status says "1 records parsed" for Timeline.json, Edits and Records.json (`index.ts` parsedCount).
- [x] Route cache progress: same key logic as rewarm (trace keys for GPS journeys), distinct keys, tenant-only, fetched on Settings only.
- [x] Upload size limit shown before upload, checked client-side (`ImportDropZone.tsx`, `quotas.ts`).
- [x] Shared demo login: no session list/revoke (other visitors' IP and user agent), no export-pack jobs.
- [x] Bottom nav: distinct short labels ("Day" vs "Trips").
- [x] Timeouts on every OSRM and Nominatim fetch.
- [x] Refresh location queries when an import job reaches `ready`.
- [x] Hide the minimap while a bottom-left overlay (playback, Routes actions) is shown.
- [x] Demo tour no longer ends on a blank Settings page.

## Phase 2 - Speed and reliability

- [x] `getDay`: read rows in a short `withTenant`, then route/geocode outside the transaction; shared caches written with the HTTP driver; live `resolveCoords` capped and paced; abort on client disconnect.
- [x] Close the per-request Neon `Pool` (`waitUntil(pool.end())`).
- [x] Imports: stale `processing` jobs fail after 15 minutes; aggregates select only the columns they need (no `activities.path`).
- [x] Rewarm capped to a small batch per request.
- [x] Heatmap: cache settlement misses; no live geocoding on every load.
- [x] Day View error state with a retry, not "No data for this date".

## Phase 3 - Data correctness

- [x] Import only leaf visits (Timeline `hierarchyLevel`), so nested stays are not double counted.
- [x] Records.json and Timeline Edits raw signals feed GPS paths and stay detection instead of 2-minute fake visits.
- [x] Home/work, away nights, commute and moving history use the user's timezone.
- [x] Real places: a `place_key` per visit (Google placeId, else a snapped coordinate key); places directory, labels, search and Day View use it; the 0.5 degree grid becomes a region rollup only.
- [x] Legacy Takeout "Semantic Location History" (`timelineObjects`) parser, all monthly files merged.
- [ ] Keep Google's place names from legacy exports per tenant (needs a tenant place-name table separate from user labels).

## Phase 4 - Layout

- [x] Five primary tabs: Map (Heat / Lines), Days, Trips, Places, Insights; account items at the bottom of the rail; Admin once, staff only.
- [x] One page template: `w-96` panel with sticky header and "Filters (n)" toggle; `CatalogPage` with breadcrumb; shared Skeleton / EmptyState / ErrorState with `destructive` tokens.
- [x] Map overlay corners fixed (top-right Layers, bottom-right zoom/legend, bottom-left playback/actions); desktop map tools collapsed into "Layers".
- [x] One onboarding/no-data screen with the drop zone.
- [x] Plain-language copy: Pricing, changelog, Day View loading, catalog captions; billing badge words.
- [x] Theme fixes (hardcoded reds/hex), minimum text size, `inert` on closed drawers, mobile "More" as a Sheet.

## Phase 5 - Features

- [x] Insights for any date range, and this year vs last.
- [x] Privacy: delete everything at a place, auto-delete after N years, home blur in exports.
- [x] Visit notes and mode correction (tenant overrides applied in Day View).
- [x] GPX / GeoJSON / visits CSV export.
- [x] Use Timeline `timelineMemory` (seed named trips) and Google's own home/work.
- [x] "On this day" in the app (Insights). Not as an email: AGENTS.md forbids activity digests and place names in mail.

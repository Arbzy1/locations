# Further features and pages

Ideas for pages and features this Timeline explorer could add. **Nothing here is a commitment to build.** Shipped behaviour stays in [Features](features.md).

Privacy default stays: no live tracking, and no sharing maps with strangers unless the product later chooses a private-share model. Those ideas sit under [Social and sharing](#11-social-and-sharing-flagged) and [Later / research](#13-later--research) so they are not mistaken for current scope.

Items marked **(API ready)** already have endpoints or schema fields. They need UI, not a new backend.

Highest leverage remaining: merge/split clusters, seasonal heatmaps, sharing (if ever).

Do not start with live sharing, family tenancy, or an LLM that sees coordinates.

## What already ships

Hotspots, Day View, Day Trips, Insights, Settings, auth, legal, import, billing, search.

Explore overflow (not extra bottom-nav tabs) also includes: place directory and place page, corridor page, coverage map, compare days, time-lapse replay, month/week/on-this-day/gaps, year-in-review page with private PNG download, multi-day trip story and named trips, away nights, commute, weekend vs weekday, firsts, life chapters, moving history, routine vs anomaly, onboarding, import history, data health, staff console (own tenant, no coordinates), waitlist copy when signup is disabled, and an optional MapLibre globe of heatmap points.

---

## 0. Quick wins

Shipped. See [Features](features.md).

---

## 1. New pages (whole screens)

The screens listed here in earlier drafts now live under Explore. Remaining whole-screen ideas:

- Trip cover photos (opt-in; not in the product)
- Family tenancy / shared maps (see Social)
- Public year-in-review URLs (rejected: PNG download only)


## 2. Hotspots and places

- Merge two clusters that Google split
- Split a blob that mixed two venues
- Time-of-day heat: mornings vs nights at a place
- Seasonal heatmaps (summer vs winter)
- Source overlay: which Google account contributed the point
- "How I got here" from a hotspot: inbound corridors
- Radius slider for cluster size
- Draw a polygon and get stats inside it
- Hex / H3 grid instead of raw points
- Country / region choropleth
- Elevation / terrain overlay
- Indoor vs outdoor guess (weak signal; show as guess)

---

## 3. Day View and timeline

Shipped in the app (see [features.md](features.md)): time scrubber and playback, sunrise/sunset on the scrubber, overnight stay labels, unknown-movement gaps.

- Weather at the time (historical API; optional, privacy-safe: date + grid only)
- Photo pins if you later allow local EXIF import (opt-in, never email coords)
- Notes on a visit (tenant-only journal)
- Correct a mode (walk that was tagged car)
- Split / merge visits (editing individual visits is [not in the app](features.md) today; list as optional)
- "Same time last year" ghost overlay
- Print / PDF a day
- Accessibility: timeline as a table, keyboard day hopping
- Offline day cache for last N days

---

## 4. Trips, travel, and mobility

- Carbon estimate from modes (labelled as rough)
- Speed histograms
- Typical commute duration over years
- Border crossings / country ticks
- Timezone-aware local time (settings timezone exists; use it everywhere)
- Miles vs km already in settings: apply to every leftover hardcoded `mi`

---

## 5. Insights and storytelling

- Distance vs temperature if a historical weather API is added

Shipped from this list: year-in-review chapters, streaks, new/lapsed places, personality cards, year compare, walk goal, hour-of-week heatmap, stacked modes, Insights CSV/PNG, extra fun facts, opt-in monthly recap email.

---

## 6. Search, filters, and navigation

- Mobile search (command palette / sheet)
- Filter all views by date range, source, mode, place tag
- Saved filter presets
- Jump to GPS (paste lat,lon)
- Recent places
- Command palette (`g h` Hotspots, `g d` Day, date tokens)
- Deep links that survive refresh (router already exists for tabs)

---

## 7. Maps and basemaps

- MapLibre / vector tiles (if CSP and vendor keys allow)
- 3D buildings
- Traffic overlay (historical: hard; skip unless a vendor exists)
- Isochrones from home
- Measure tool
- Bookmark map views
- Mini-map
- Better collision of heatmap vs layers vs legend (iterate on mobile)
- Cluster click to spiderfy visits
- Street View / Mapillary link-out (external; do not load PII into their URL if avoidable)
- Custom tile URL in Settings for self-hosters

---

## 8. Import, sources, and data quality

- Drag-drop on empty state
- Import from Google Takeout folder structure with clearer errors
- Records.json vs semantic Timeline: explain which file won
- Duplicate-day merge preview
- "What will this import change" dry run
- Multiple phones / accounts as coloured layers
- Delete a date range
- Reprocess routes only
- Detect Takeout timezone bugs
- Import GPX / GeoJSON / Strava / Apple (new parsers; large)
- Continuous sync: out of character (live tracker). If ever: opt-in companion, not default

---

## 9. Account, billing, privacy

- Change display name in Settings (email and password change already ship)
- Sessions list and revoke
- 2FA
- Passkeys
- Data export ZIP (JSON + a simple HTML summary with no third-party map keys)
- Retention: auto-delete after N years
- Download a GDPR pack
- Pause subscription vs cancel copy
- Family plan: conflicts with tenant-per-user; only if you redesign tenancy
- Referral / gift subscription
- Invoice history
- Danger zone: delete one source vs whole account (source delete exists)

---

## 10. Mobile and PWA

- Installable PWA
- Add to Home Screen
- Bottom-sheet search
- Swipe between days
- Haptics on day change
- Large-map / cinema mode
- Home-screen widget: none without a native app
- Companion app: still not a live tracker

---

## 11. Social and sharing (flagged)

Current product explicitly is **not** "share a map with other people". If you ever want it:

- Private unlisted link with expiry and no index
- Screenshot / video export instead of a live share
- Compare with a friend via local file exchange, not a shared tenant
- Collaborative labels: needs a new tenancy model

Prefer exports and screenshots over multi-user maps unless you are ready to redo RLS.

---

## 12. Staff, demo, and growth

- Richer public demo: scripted tour
- Marketing landing (separate from the app shell)
- Pricing page
- Changelog in-app
- Status page (Worker + Neon)
- Admin: stuck imports, tenant wipe runbook UI (coords still never in logs)
- Feature flags

---

## 13. Later / research

- Semantic "what was I doing" from dwell + hour + type
- LLM journal: dangerous (coords in prompts). If ever: local model, redacted places, never email
- AR "stand where you stood"
- Music / calendar overlay from other Takeout products
- Predict "you will go to X on Thursday" (creepy; skip unless opt-in research)
- Game: coverage %, visit badges
- Soundscape of a day (synthetic; novelty)
- Physical print atlas
- Browser extension: none that reads live location
- Native iOS/Android: only as a viewer of imported history

---

## Suggested sequencing (if you build any of this)

1. Place page + directory
2. Multi-day trip page
3. Year / month / on-this-day
4. Later: GPX import, PWA, sharing, LLM (only with redaction)

```text
place page --> trip page --> year/month/on-this-day
year/month --> later (GPX, PWA, sharing, LLM)
```

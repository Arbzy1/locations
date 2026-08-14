# Further features and pages

Ideas for pages and features this Timeline explorer could add. **Nothing here is a commitment to build.** Shipped behaviour stays in [Features](features.md).

Privacy default stays: no live tracking, and no sharing maps with strangers unless the product later chooses a private-share model. Those ideas sit under [Social and sharing](#11-social-and-sharing-flagged) and [Later / research](#13-later--research) so they are not mistaken for current scope.

Items marked **(API ready)** already have endpoints or schema fields. They need UI, not a new backend.

Highest leverage with the current schema: place page, trip page, real year-in-review screen.

Do not start with live sharing, family tenancy, or an LLM that sees coordinates.

## What already ships

Hotspots (including hide place and home/work pins), Day View (including arrived/departed on timeline rows), Day Trips, Insights (unique places, monthly top places, year-in-review places/modes, area and corridor map), Settings (display name, JSON export, billing grace copy), login / signup / forgot / reset-password, magic link and email OTP, legal pages, import, billing, search (including phones), place rename, heatmap, OSRM routes.

---

## 0. Quick wins

The catalog items that were API-ready are in the product. See [Features](features.md). Remaining ideas start at new pages below.

---

## 1. New pages (whole screens)

### Exploration

- **Place page** (`/places/:key`): all visits, time-of-day histogram, first/last seen, related corridors, map of that cluster
- **Place directory** (`/places`): searchable, sortable list of every named cluster
- **Corridor page** (`/corridors/:a/:b`): every transition between two places, typical mode, duration
- **Area / city page**: visits grouped by settlement / country
- **World / coverage map**: where you have any data, not just hotspots
- **Compare two dates** (`/compare`): split map or overlay two days
- **Time-lapse** (`/replay`): animate a day, a week, or a year
- **3D globe / flyover** (deck.gl / MapLibre) as an optional view

### Trips

- **Trip page** (`/trips/:id`): a multi-day grouping as one story (map + days + stats)
- **Trip builder**: stitch consecutive days, name the trip (no cover photo unless the product later allows photos)
- **Holiday / away detector**: nights not at home
- **Commute page**: weekday home-work-home loops, typical departure times
- **Weekend vs weekday** explorer

### Time

- **Year in review page** (`/review/2024`): full-screen recap, shareable as a private PNG the user downloads, not a public URL
- **Month view** (`/month/2024-08`): calendar + monthly heatmap
- **Week view**: seven-day strip
- **On this day** (`/on-this-day`): same calendar date across years
- **Gaps page**: days with no Timeline (phone off, Takeout holes)
- **Firsts**: first visit to each city / country / place type

### People-adjacent (still private)

- **Life chapters**: user-named date ranges (uni, job, city you lived in)
- **Moving history**: inferred home changes over years
- **Routine vs anomaly**: days that do not look like your typical Tuesday

### Account / ops

- **Onboarding wizard** after signup: verify email, how to Takeout, first import, first heatmap
- **Import history page**: every job with counts, errors, retry
- **Data health**: duplicate visits, overlapping activities, unknown modes
- **Staff console** (admin/developer only): tenant counts, stuck jobs, no PII coordinates in UI
- **Waitlist page** when `DISABLE_SIGNUP=true`

---

## 2. Hotspots and places

- Semantic type filters (home, work, restaurant, transit)
- Merge two clusters that Google split
- Split a blob that mixed two venues
- Custom place categories / tags / colours
- Favourite places
- "Never show this cluster" (hidden) plus a Hidden places manager
- Time-of-day heat: mornings vs nights at a place
- Dwell-time ranking vs visit-count ranking (toggle)
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

- Scrubber: drag time, map follows
- Playback with speed control
- Weather at the time (historical API; optional, privacy-safe: date + grid only)
- Sunrise / sunset markers
- Photo pins if you later allow local EXIF import (opt-in, never email coords)
- Notes on a visit (tenant-only journal)
- Correct a mode (walk that was tagged car)
- Split / merge visits (editing individual visits is [not in the app](features.md) today; list as optional)
- "Same time last year" ghost overlay
- Print / PDF a day
- Accessibility: timeline as a table, keyboard day hopping
- Offline day cache for last N days
- Detect stays that crossed midnight more clearly
- Show connector gaps as "unknown movement" with a repair hint

---

## 4. Trips, travel, and mobility

- Named trips with start/end, distance, countries, modes
- Flight detector vs flying mode already in data
- Train line guess from stations
- Driving vs public transit split for a year
- Longest day, farthest from home, most stops
- "Stuck in one place" days (illness, WFH, lockdown)
- Carbon estimate from modes (labelled as rough)
- Speed histograms
- Typical commute duration over years
- Border crossings / country ticks
- Timezone-aware local time (settings timezone exists; use it everywhere)
- Miles vs km already in settings: apply to every leftover hardcoded `mi`

---

## 5. Insights and storytelling

- Full year-in-review with chapters: places, modes, trips, firsts, streaks
- Monthly recap email (transactional only: no coordinates or place names, per email-privacy)
- Streaks: consecutive days with data
- New places this month vs last
- "You have not been to X in N years"
- Personality-style cards: walker, flyer, creature of habit (keep them skippable, not creepy)
- Compare two years
- Goals: walk N km this month (local only)
- Charts: hour-of-week heatmap, mode by year stacked area, distance vs temperature if weather added
- Export Insights as PNG / CSV
- Fun facts: already there; add "most boring Tuesday", "longest stay without leaving"

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

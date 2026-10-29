# Changelog

## Unreleased

Day View shows where GPS went quiet: a stretch of a journey with no GPS point for over 10 minutes is drawn as a faint dash, so you can see which part of the line is a guess. Train journeys that Google recorded with the walk to and from the platform draw those ends as walking.

Journey cost can be played with after a route (or with miles you type). Pump price, mpg, and steady speed change litres, fuel cost, time, and CO2 immediately, without another request. "Litres to save" shows the slower steady speed, and the mpg, that would use that much less fuel. Tolls and clean-air charges stay as estimated. The speed model is steady driving only: stops are not included. Bad figures (empty, zero, out of range) are rejected in the panel instead of producing a cost.

Faster everywhere. Local `dev:all` runs Vite and Wrangler without a production build (`dev:e2e` for the built app, `dev:kill` for stuck ports). The first page downloads much less: about 172 KB of JavaScript instead of 279 KB (recharts no longer preloads on every page), and Pricing, Status, Changelog and the legal pages load on demand (entry 77 KB to 49 KB). The API builds sign-in once per server instance, uses one database connection per request, and sends `Server-Timing` (auth, db, build, geo). The overview is one database statement and the heatmap one scan, with identical results. Day View routes journeys and names places four at a time while keeping the 1-per-second place lookup limit. The map redraws only the layer group that changed (sliders no longer rebuild it, labels only when you cross a zoom level). Production deploys from `master` through the "Deploy production" workflow, staging on every push to `master`; each Worker has one cron (the free plan allows five per account), which also runs the monthly jobs on the 1st.

Day View colours journeys by transport: every mode has its own colour (and line style) in both themes, the same on the map, the timeline, the calendar dots and Insights. Journeys are numbered on the map to match the timeline, with direction arrows from street level; a trip out and back along the same road is drawn as two lines side by side. Tap a journey (on the map or in the timeline) to bring it forward and fade the rest; a legend of the day's modes hides or shows each one. Layers has "Colour lines by: Transport / Journey" for the old per-journey colours.

Trains detected from your GPS points: a journey Google called driving or a bus becomes a train (or Underground) when most of its points sit on a railway at train speeds, and it is drawn along the actual tracks in Day View and Routes. Walks at cycling speed, "drives" at walking pace and flights get fixed the same way. Each change shows a "Detected train" badge with one tap to switch back; weaker matches show "Might be a train". Your existing journeys are checked once in your browser; mileage by mode and statistics follow. Mode fixes you make now also update statistics and Routes, not only Day View. Road lines that wander away from your GPS points (or are thrown by a GPS spike) fall back to the points. Migration `0022_activity_mode_detection`.

Rail map data for Great Britain, the Isle of Man and the island of Ireland ships with the site as small static tiles (`/assets/rail/v1/`), ready for spotting train journeys that Google labelled as driving. Built by hand from OpenStreetMap with `npm run rail:build`; served as plain files, so they cost no Worker time. Rail data © OpenStreetMap contributors, ODbL (see `docs/legal/credits.md` and the Terms page).

Imports of any size work on Cloudflare's free plan: your browser reads the export and works out the statistics, and the site saves them in small checked batches with a live progress bar. Statistics also update in the browser after deleting a place or a date range, changing the history limit or timezone.

Journey cost (formerly the standalone Brim app) is now a Locations tab at `/journey-cost`: UK trip cost for petrol, diesel, hybrid, and EV cars, with tolls, clean-air zones, the cheapest forecourt along the route, a garage with brim-to-brim calibration, saved journeys, and the HMRC mileage tally. It uses your Locations account, works before any Timeline import, and adds a Journey cost section to Settings. Data is tenant-scoped under FORCE RLS and wiped with the account. Demo can estimate but not save.

Day View "Points" line option: only the GPS points your phone recorded, with no lines, coloured by journey. The panel counts the points, how many journeys had none, and the longest gap between points; tap a point for its time.

Older Takeout exports keep Google's own place names: Day View, the place directory and Insights show them unless you have renamed the place. Migration `0019_visit_google_name`; re-import to fill it.

New features: Insights for any period with the same dates last year beside it, and an "On this day" card (in the app only, never emailed). Export GPX, GeoJSON (up to a year) or a stays CSV, with home blurred to about 1 km by default. Privacy tools: rename, hide or delete everything at a place (stays, journeys to or from it, GPS points within 200 m), and keep history for 1 to 10 years (older days deleted now and on the 1st of each month). Notes on any stay or journey and transport-mode fixes that Day View routes with; both survive re-imports. Google's own trips (`timelineMemory`) become named trips and Google's Home and Work labels win over the hour-of-day guess. Migrations `0017_retention_years` and `0018_timeline_overrides` (new tenant table with FORCE RLS).

Simpler layout: five tabs (Map with a Heat / Lines switch, Days, Trips, Places, Insights), Admin listed once for staff. Map corners are fixed: Layers top-right (desktop tools fold into it), zoom bottom-right, playback and page actions bottom-left. Hotspot filters fold behind "Filters (n)" under a sticky header; side panels share one width. Catalog pages show a breadcrumb back to their section. Shared empty and error states with Try again. One first-run screen with plain export steps and the drop zone (also at `/onboarding`). Plain words on Pricing, billing status, the changelog and the Day View loading screen. A danger colour token replaces hardcoded reds, nothing is smaller than 11px, the closed tablet drawer is inert, and mobile More is a bottom sheet.

More accurate history (re-import to apply): stays Google nests inside another (a shop in a shopping centre) no longer count twice; the parent is split around them. Records.json and Timeline Edits raw positions become real stays (10+ minutes in one spot) and journeys with GPS paths instead of 2-minute fake visits. Older Takeout "Semantic Location History" monthly files import, every month merged. Home, work, away nights, commute and moving history use your timezone and count long evening stays as nights. Places are real places now: each stay has a place key (Google's place, else the spot to ~100 m); the place directory, renaming, hiding and search use it, and Day View shows your name for a place. Migration `0016_visit_place_key` adds and backfills the column.

Faster, sturdier Day View: day rows load in a short database transaction and routing and place names run afterwards on a stateless connection, so a slow day no longer holds a connection open; closing the tab stops the work. Place-name lookups are capped at 10 per day and spaced a second apart, as Nominatim asks. Database pools close after each request. An import stuck for 15 minutes is marked failed so you can upload again. Aggregate rebuilds skip GPS paths. The heatmap remembers places with no town, so it stops asking for them. Day View shows "This day did not load" with Try again on a failure instead of "No data for this date".

Quick fixes from the October audit: days with journeys from one place no longer say "Stayed at X all day"; the import status counts real records; road route progress lives in Settings ("Road routes") and matches how Day View routes journeys; the drop zone shows your upload limit and rejects oversized files before uploading; the shared demo cannot see or revoke sessions or build export packs; the bottom nav says Day and Trips; routing and place-name lookups time out after 6 seconds; maps refresh as soon as an import finishes; the minimap hides behind playback and Routes controls; the demo tour ends on Insights instead of a blank Settings page.

Routes view (`/routes`, `g r`): every journey line for a day, month, year, or custom range (up to a year), coloured by transport mode, as recorded (GPS trace, or a dashed straight line when there were no fixes). Month chips with mileage for every month with data, year chips, `[` and `]` to step, a mode legend that hides or shows modes, source chips, and "Show everything". The map fits the busiest region so trips abroad do not shrink everyday journeys. Lines open their day in a new tab. Served by `GET /api/routes` (no routing calls). "This month" in Explore and the month page link here.

Day View "Journey lines" toggle: Best (GPS snapped to roads), Recorded (straight lines between GPS fixes), or Predicted (OSRM fastest route, loaded with `?compare=1`), with how closely the prediction follows your GPS points. Each journey gets a confidence badge (fix count, longest gap, offset from the drawn line) and "through" towns from its GPS trace. Stays are drawn at the median of GPS fixes recorded during them (`visits.fix_lat`/`fix_lon`/`fix_count`, migration `0015_visit_fix`), with how far that is from Google's place; needs a re-import.

Hotspots: tap a hotspot (zoomed in) or "Days I was here" on a listed place to see every day you were there with time spent, each with "New tab" (keeps the Hotspots page as it was) and "Open". The selected spot is kept in the URL (`?spot=`). Served by `GET /api/hotspots/days`.

Day calendar (Day View and Routes day mode) has year and month menus to jump straight to any month; empty months are marked and picking a year lands on its nearest month with data.

The demo tenant keeps a single source on import, so demo days no longer show each journey twice.

Day View no longer crashes when a day loads. The playback marker was added to the map before it had a position, which threw inside MapLibre and blanked the page. The map also stops redrawing every line and marker on each playback frame.

Maps load again. Carto raster tiles now return "API key required" images, so the default basemap is OpenFreeMap's keyless vector styles (`dark` and `positron`) when `MAP_STYLE_*` and `MAP_TILE_*` are unset; the CSP allows `tiles.openfreemap.org` only while that default is in use, and raster tiles saved in Settings still win. Day View journey lines draw again: source colours were `var(--token)` strings that MapLibre cannot paint, so they are resolved to the theme's colour, and with a single data source each journey keeps its own colour. Timeline journey rows no longer nest the road-steps button inside another button.

Production maps draw their overlays again. MapLibre 6 loads its worker from beside its own module, which Vite bundles into `/assets/index-*.js` without emitting the worker, so every GeoJSON layer (journeys, stops, heatmap) and vector tile stayed pending in production builds. The worker is now built by Vite (`?worker&url`) and passed to `setWorkerUrl` in `lib/map/maplibre.ts`; import `maplibregl` from there. Stop cluster counts use Noto Sans, which OpenFreeMap serves. The Globe uses the configured vector style, sets its projection once the style has loaded (it threw "Style is not done loading"), and no longer rebuilds on every render.

Day View journeys follow your recorded GPS points. Import keeps Timeline `timelinePath` fixes on each journey (new `activities.path` column, migration `0014_activity_path`), and Day View snaps them onto roads with OSRM map matching (chunked to the public server's 10-point limit), falling back to a via-point route and then the raw trace when a road route strays from the recorded distance. Trains and flights draw the raw trace instead of an arc. Journey endpoints that Timeline recorded kilometres away are anchored to the adjacent stop when GPS agrees with it, overlapping stays no longer show negative "unknown movement" gaps, and gaps are routed on foot or by car from the implied speed. Journeys are tagged GPS or estimated in the timeline and popups; estimated lines draw fainter. Existing tenants need a re-import to pick up the GPS points.

## 0.0.1

Colour moods in Settings, Display: 30 named palettes (light and dark each) on top of the existing theme toggle. Stored in `locations-mood`. Map tiles still follow light and dark.

Web components are grouped by domain: `auth`, `settings`, `legal`, `explorer`, `shell`, plus existing `admin`, `catalog`, `marketing`, and `ui`. Web `lib` follows the same split (`map`, `explorer`, `nav`, `admin`, `settings`, `marketing`), with `utils`, `motion`, `theme`, `units`, `auth`, and `demo` left at the root.

Public `/`, `/login`, and `/signup` share an AuthShell (desktop split hero, mobile sheet over a faint SVG world). Optional Google OAuth via Better Auth when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; `GET /api/config` exposes `googleAuth` (no client id in the bundle). Login leads with Google and demo; email, magic link, and OTP stay as secondary paths.

`npm run test:security` encodes the security catalog: route matrix, policy scanners, FORCE RLS leaks, privacy/XSS, and `npm audit`. Not a live pentest.

Admin panel at `/admin` (accounts and ops, not other-user maps). Operator tools: invite, password reset, unverify, stuck import/export unlock (fail the job, no Takeout requeue), flag reset to env, maps probe, email self-test to the staff inbox, attention tiles, and load-more lists. Payloads stay ids, emails, counts, statuses, and sanitized errors. `ops_flags` / `ops_audit` overlay wrangler kill switches. `npm run test:admin` covers the `/api/admin` matrix.

Account delete wipes Timeline under FORCE RLS (`withTenant`), pages R2 prefixes until empty, and clears verification tokens. Password reset and email change revoke other sessions. One active import per tenant (409). In-app rate limits on search, billing, and reverse-geocode; Cloudflare WAF remains the hard edge control. Staging CSP is enforcing. Production/staging `workers_dev` hostnames are off. Better Auth upgraded to 1.6 (hashed email OTPs, two-step email change).

Public marketing pages outside the app shell (landing, pricing, status, changelog), a skippable scripted demo tour, staff stuck-import list and tenant-wipe runbook, and env feature flags (`globe`, `demoTour`, `landing`). `GET /api/health` reports Worker and database separately. Activity guesses from dwell, hour, and place type (not an LLM) plus coverage percent and visit badges; existing tenants see those after the next import.

Import quality: drag-drop empty state and Settings drop zone, zip extract that reports which Timeline file won, `POST /api/import/preview` plus skip-overlapping-days merge, source colours as Hotspots heat layers and Day View filters, date-range delete, capped route rewarm, and a timezone-skew warning (dates are not rewritten).

Product maps run on MapLibre (heatmap, journeys, playback, clustering). Vector styles and 3D buildings are optional via env. Map chrome unifies layers, heatmap, measure, and saved views. Custom raster XYZ is allowlisted for self-hosters.

Settings: signed-in session list and revoke, pause vs cancel billing copy (invoices stay in the Stripe portal), a labelled Danger zone for account delete, and a download-only GDPR pack ZIP of Timeline rows.

Command palette search (`Ctrl/Cmd+K`, mobile sheet), URL-synced Hotspots and Day Trips filters, GPS jump, on-device recents and filter presets, and `g h` / `[` `]` keyboard jumps.

Explore overflow (desktop rail and mobile More) with nested catalog pages: place directory and place pages, corridors, coverage, compare, time-lapse, month/week/on this day/gaps, year-in-review PNG, trip stories and named trips, commute, away nights, firsts, chapters, onboarding, import history, data health, Admin panel (accounts, flags, billing, imports; own tenant on `/admin/me`), in-app changelog, activity guesses, badges, and an optional heatmap globe.

Day View time scrubber and playback (estimated path along stays and predicted routes), sunrise/sunset ticks, overnight stay labels, and unknown-movement gap copy.

Insights and Day Trips: auto-named multi-day trips, flight tagged vs guessed counts, train hops, yearly driving vs transit miles, extra facts (longest day, farthest from home, most stops), and low-movement days. Existing tenants see the new stats after the next import.

Hotspots: place-type filters, visit vs time ranking, favourites, tags/colours, and a hidden-places manager.

Transactional email catalog (verify, OTP, magic link, import and billing status) via Resend. See [docs/product/email.md](product/email.md).

Documented a product idea catalog in [docs/product/ideas.md](product/ideas.md). Not a commitment to build.

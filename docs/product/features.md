# Features

What the hosted app does today. Nothing here is a roadmap.

## Maps

- **Hotspots:** visit-density heatmap, ranked places, date range, filter by Timeline source; multiple sources draw as coloured heat layers
- Rank by visit count or time spent
- Filter by Google place type, favourite, and your tags
- Heatmap on/off, opacity, and strength
- Rename a place (saved for your account only)
- Favourite, colour, and tags on a place
- Hide a place from Hotspots, search, Insights lists, and the place directory (discovery only). Day View, place-history rows, cluster detail, and corridors still list those visits. Hide is not a delete.
- Home and work guess pins on the Hotspots map when those clusters have coordinates
- **Day View:** one day on a map plus a chronological timeline; optional source chips colour the timeline and journeys
- Calendar of days that have data; previous/next day
- Visits and journeys on the map; tap a timeline row to zoom
- Time scrubber and playback with speed control; the map follows an estimated playhead along stays and predicted routes (not raw GPS breadcrumbs)
- Sunrise and sunset times on the scrubber, computed on-device from the day's first point
- Overnight stays: labelled when a visit started yesterday or continues past midnight; those stays also appear on the next morning
- Timeline rows show arrived-by / left-by when Google recorded a mode
- Gaps without a recorded journey show as unknown movement, with a note that the dashed path is inferred
- Journeys use cached road geometry when it is available (turn-by-turn steps in the timeline)
- Basemaps: auto (follows theme), street, satellite; optional vector style from env
- 3D buildings when a vector style is configured
- Measure tool, visit clustering with spiderfy, Street View / Mapillary link-out (coordinates only)
- Saved map views (capped) and a desktop overview mini-map
- Optional custom raster XYZ in Settings when the operator allowlists hosts
- Dark / light UI theme
- Optional 3D globe of heatmap points at `/globe` (MapLibre, config flag `globe`)

## Trips and stats

- **Day Trips:** days with more range or more places, listed with distance, stops, and modes
- Filter by year, mode, minimum range, and place name; sort by date, distance, range, or stops
- Open a trip to that day in Day View
- **Explore** overflow (desktop rail, mobile More): place directory and place pages, corridors, coverage, compare, replay, month/week/on this day/gaps, year-in-review, trip stories, commute, away nights, chapters, activity guesses, badges, changelog, and related screens
- Auto-named multi-day trips (start and end place names, modes, distance) on Insights and Day Trips; tap opens the trip story
- **Insights:** total distance, days tracked, visits, journeys, unique places
- Monthly distance chart, per-month top places, and transport-mode breakdown
- Yearly table with driving vs public-transit miles, plus a year-in-review teaser and a `/review/:year` chapter page (places, modes, trips, firsts, streaks)
- Streaks, new places this month vs last, lapsed places, two-year compare, stacked modes-by-year, and hour-of-week heatmap
- Skippable personality cards and a local-only walk goal (this device only)
- CSV and private PNG download of Insights and the year review
- Frequent travel corridors and frequent areas, with a compact map of area markers and corridor lines
- Home and work guesses from overnight / weekday visits (not confirmed addresses)
- Flights: Timeline flying mode vs a distance/speed guess (heuristic; mode is not overwritten)
- Train hops guessed from consecutive train legs and nearby stations (not named rail lines)
- Low-movement days: little range and few places (a guess, not a diagnosis)
- Extra stats: busiest day, longest day, farthest from home, most stops, longest journey, estimated steps, most boring Tuesday, longest stay without leaving
- Activity guesses from dwell, hour of day, and Google place type (not an LLM; place names stay off the list)
- Coverage percent and visit badges (days tracked, places, walking miles)

## Search

- Command palette from the header (`Ctrl/Cmd+K`). Desktop dialog, bottom sheet on phones
- Search places (including your labels and tags), ISO dates, months, Explore pages, and `lat,lon` GPS jump
- Hidden places stay out of search, heatmap, and directory lists. Day View and place-history rows still list those visits. Hide is discovery-only, not a privacy wipe.
- Recent places and named filter presets stay on this device
- Keyboard: `g` then `h`/`d`/`t`/`i`/`e`/`s` for main pages; `[` / `]` previous/next day
- Hotspots and Day Trips filters live in the URL so refresh keeps them. Insights is the full import, not a date slice

## Import

- Upload Google Timeline JSON or a Takeout zip (`Timeline.json` / `Records.json`)
- Drag-drop on the empty Hotspots state and in Settings; a preview shows which zip file won, date overlap, and replace vs merge vs skip-overlap counts
- One source per Google account; label, colour, rename, re-upload, merge (optional skip overlapping days), or delete a source
- Delete a date range (optionally per source) from Settings
- Reprocess a capped batch of predicted routes from Settings
- Import progress shows records parsed, visits written, and the chosen file name
- Timezone skew is a warning only (dates are not rewritten)
- Email must be verified before import
- Demo accounts cannot import

## Account

- Sign up with Google (when configured) or email and password (unless signup is turned off; then `/signup` shows a closed-signup page)
- Onboarding steps at `/onboarding` (verify, Takeout, import). Empty accounts are sent there from Hotspots.
- Import history and data-health counts under Explore
- Verify email with a link or a 6-digit code; resend from Settings
- Sign in with Google (when `GET /api/config` `googleAuth` is true), password, a one-time email link, or a 6-digit code
- Forgot password; choose a new password at `/reset-password`
- Change display name, email (re-verify), and password from Settings
- List signed-in sessions and revoke one or all other devices from Settings
- Download a JSON summary of overview, sources, settings, and place labels
- Download a GDPR pack ZIP (account JSON, visits/activities JSONL, HTML summary with no map tiles)
- Public demo with sample journeys (read-only) and a skippable scripted tour for the demo role
- Public marketing pages outside the app shell: `/` landing, `/pricing`, `/status`, `/changelog` (Privacy, Terms, and Cookies links on those pages)
- In-app changelog under Explore (`/updates`)
- Staff (`admin` / `developer`) can open the `/admin` Admin panel for accounts, flags, billing, imports, exports, email, maps, analytics, audit, and diagnostics. They cannot open another user’s maps. Own-tenant counts stay on `/admin/me`. Admin can invite (`user` / `developer`), send a password reset, unverify, unlock stuck jobs (fail only, user re-uploads), reset flags to env, and send a self-test email to their own inbox. Developer stays GET-only. Demo create/reset stays `npm run auth:create-demo`.
- Env feature flags on `GET /api/config` (`globe`, `demoTour`, `landing`)
- Miles or kilometres, and an IANA timezone
- Opt-in monthly recap email (counts only; off by default)
- Stripe subscribe (monthly or yearly) and customer portal when billing is configured
- Customer portal for invoices, payment method, pause, and cancel (enable pause in the Stripe Dashboard)
- Failed payment: read-only grace copy in Settings until `graceUntil`, with import paused
- Status email when import finishes or fails, and when billing becomes active, past due, or canceled
- Delete one Timeline source, or delete the account (wipes Timeline rows, uploads, export packs, sessions, and the Stripe customer)
- Privacy, Terms, and Cookies pages

Possible later work (not a roadmap): [Further features and pages](ideas.md).

## Not in the app

- Live Google Location sharing or a phone tracker
- Editing individual visits on the map
- Sharing a map with other people

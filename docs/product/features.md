# Features

What the hosted app does today. Nothing here is a roadmap.

## Maps

- **Hotspots:** visit-density heatmap, ranked places, date range, filter by Timeline source
- Rank by visit count or time spent
- Filter by Google place type, favourite, and your tags
- Heatmap on/off, opacity, and strength
- Rename a place (saved for your account only)
- Favourite, colour, and tags on a place
- Hide a place from Hotspots, search, and Insights (Day View still lists the visits); unhide from Hidden places in the Hotspots panel
- Home and work guess pins on the Hotspots map when those clusters have coordinates
- **Day View:** one day on a map plus a chronological timeline
- Calendar of days that have data; previous/next day
- Visits and journeys on the map; tap a timeline row to zoom
- Time scrubber and playback with speed control; the map follows an estimated playhead along stays and predicted routes (not raw GPS breadcrumbs)
- Sunrise and sunset times on the scrubber, computed on-device from the day's first point
- Overnight stays: labelled when a visit started yesterday or continues past midnight; those stays also appear on the next morning
- Timeline rows show arrived-by / left-by when Google recorded a mode
- Gaps without a recorded journey show as unknown movement, with a note that the dashed path is inferred
- Journeys use cached road geometry when it is available (turn-by-turn steps in the timeline)
- Basemaps: dark, light, street, satellite
- Dark / light UI theme
- Optional 3D globe of heatmap points at `/globe` (MapLibre, config flag `globe`)

## Trips and stats

- **Day Trips:** days with more range or more places, listed with distance, stops, and modes
- Filter by year, mode, minimum range, and place name; sort by date, distance, range, or stops
- Open a trip to that day in Day View
- **Explore** overflow (desktop rail, mobile More): place directory and place pages, corridors, coverage, compare, replay, month/week/on this day/gaps, year-in-review, trip stories, commute, away nights, chapters, and related screens
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

## Search

- Search place names and dates from the header (including phones); places open the place page, dates open Day View

## Import

- Upload Google Timeline JSON or a Takeout zip (`Timeline.json` / `Records.json`)
- One source per Google account; label, rename, re-upload, merge, or delete a source
- Import progress shows records parsed and visits written
- Email must be verified before import
- Demo accounts cannot import

## Account

- Sign up with email and password (unless signup is turned off; then `/signup` shows a closed-signup page)
- Onboarding steps at `/onboarding` (verify, Takeout, import). Empty accounts are sent there from Hotspots.
- Import history and data-health counts under Explore
- Staff (`admin` / `developer`) can open `/admin` for their own tenant counts (no coordinates)
- Verify email with a link or a 6-digit code; resend from Settings
- Sign in with password, a one-time email link, or a 6-digit code
- Forgot password; choose a new password at `/reset-password`
- Change display name, email (re-verify), and password from Settings
- Download a JSON export of overview, sources, settings, and place labels
- Public demo with sample journeys (read-only)
- Miles or kilometres, and an IANA timezone
- Opt-in monthly recap email (counts only; off by default)
- Stripe subscribe (monthly or yearly) and customer portal when billing is configured
- Failed payment: read-only grace copy in Settings until `graceUntil`, with import paused
- Status email when import finishes or fails, and when billing becomes active, past due, or canceled
- Delete account: wipes Timeline rows, uploads, sessions, and the Stripe customer
- Privacy, Terms, and Cookies pages

Possible later work (not a roadmap): [Further features and pages](ideas.md).

## Not in the app

- Live Google Location sharing or a phone tracker
- Editing individual visits on the map
- Sharing a map with other people
- Full Timeline JSON dump (export is overview, sources, settings, and labels)

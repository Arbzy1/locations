# Features

What the hosted app does today. Nothing here is a roadmap.

## Maps

- **Hotspots:** visit-density heatmap, ranked places, date range, filter by Timeline source
- Heatmap on/off, opacity, and strength
- Rename a place (saved for your account only)
- Hide a place from Hotspots, search, and Insights (Day View still lists the visits)
- Home and work guess pins on the Hotspots map when those clusters have coordinates
- **Day View:** one day on a map plus a chronological timeline
- Calendar of days that have data; previous/next day
- Visits and journeys on the map; tap a timeline row to zoom
- Timeline rows show arrived-by / left-by when Google recorded a mode
- Journeys use cached road geometry when it is available (turn-by-turn steps in the timeline)
- Basemaps: dark, light, street, satellite
- Dark / light UI theme

## Trips and stats

- **Day Trips:** days with more range or more places, listed with distance, stops, and modes
- Filter by year, mode, minimum range, and place name; sort by date, distance, range, or stops
- Open a trip to that day in Day View
- **Insights:** total distance, days tracked, visits, journeys, unique places
- Monthly distance chart, per-month top places, and transport-mode breakdown
- Yearly table and a year-in-review block (totals, top places, modes)
- Frequent travel corridors and frequent areas, with a compact map of area markers and corridor lines
- Home and work guesses from overnight / weekday visits (not confirmed addresses)
- Multi-day trip groupings; tap a row to open that start day in Day View
- Extra stats: busiest day, longest journey, estimated steps, and similar

## Search

- Search place names and dates from the header (including phones); results open Day View

## Import

- Upload Google Timeline JSON or a Takeout zip (`Timeline.json` / `Records.json`)
- One source per Google account; label, rename, re-upload, merge, or delete a source
- Import progress shows records parsed and visits written
- Email must be verified before import
- Demo accounts cannot import

## Account

- Sign up with email and password (unless signup is turned off)
- Verify email with a link or a 6-digit code; resend from Settings
- Sign in with password, a one-time email link, or a 6-digit code
- Forgot password; choose a new password at `/reset-password`
- Change display name, email (re-verify), and password from Settings
- Download a JSON export of overview, sources, settings, and place labels
- Public demo with sample journeys (read-only)
- Miles or kilometres, and an IANA timezone
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

# Features

What the hosted app does today. Nothing here is a roadmap.

## Maps

- **Hotspots:** visit-density heatmap, ranked places, date range, filter by Timeline source
- Heatmap on/off, opacity, and strength
- Rename a place (saved for your account only)
- **Day View:** one day on a map plus a chronological timeline
- Calendar of days that have data; previous/next day
- Visits and journeys on the map; tap a timeline row to zoom
- Journeys use cached road geometry when it is available (turn-by-turn steps in the timeline)
- Basemaps: dark, light, street, satellite
- Dark / light UI theme

## Trips and stats

- **Day Trips:** days with more range or more places, listed with distance, stops, and modes
- Filter by year, mode, minimum range, and place name; sort by date, distance, range, or stops
- Open a trip to that day in Day View
- **Insights:** total distance, days tracked, visits, journeys
- Monthly distance chart and transport-mode breakdown
- Yearly table and a year-in-review block for the latest year
- Frequent travel corridors and frequent areas
- Home and work guesses from overnight / weekday visits (not confirmed addresses)
- Multi-day trip groupings
- Extra stats: busiest day, longest journey, estimated steps, and similar

## Search

- Search place names and dates from the desktop header; results open Day View
- Not shown on small screens (use Day View or Day Trips instead)

## Import

- Upload Google Timeline JSON or a Takeout zip (`Timeline.json` / `Records.json`)
- One source per Google account; label, rename, re-upload, merge, or delete a source
- Import progress shows records parsed and visits written
- Email must be verified before import
- Demo accounts cannot import

## Account

- Sign up with email and password (unless signup is turned off)
- Sign in, forgot password, sign out
- Public demo with sample journeys (read-only)
- Miles or kilometres, and an IANA timezone
- Stripe subscribe (monthly or yearly) and customer portal when billing is configured
- Delete account: wipes Timeline rows, uploads, sessions, and the Stripe customer
- Privacy, Terms, and Cookies pages

Possible later work (not a roadmap): [Further features and pages](ideas.md).

## Not in the app

- Live Google Location sharing or a phone tracker
- Editing individual visits on the map
- Sharing a map with other people
- Change email / password / display name from Settings (forgot-password email only)
- Data export button in Settings (`GET /api/account/export` exists for operators)

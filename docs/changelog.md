# Changelog

## Unreleased

Account delete wipes Timeline under FORCE RLS (`withTenant`), pages R2 prefixes until empty, and clears verification tokens. Password reset and email change revoke other sessions. One active import per tenant (409). In-app rate limits on search, billing, and reverse-geocode; Cloudflare WAF remains the hard edge control. Staging CSP is enforcing. Production/staging `workers_dev` hostnames are off. Better Auth upgraded to 1.6 (hashed email OTPs, two-step email change).

Public marketing pages outside the app shell (landing, pricing, status, changelog), a skippable scripted demo tour, staff stuck-import list and tenant-wipe runbook, and env feature flags (`globe`, `demoTour`, `landing`). `GET /api/health` reports Worker and database separately. Activity guesses from dwell, hour, and place type (not an LLM) plus coverage percent and visit badges; existing tenants see those after the next import.

Import quality: drag-drop empty state and Settings drop zone, zip extract that reports which Timeline file won, `POST /api/import/preview` plus skip-overlapping-days merge, source colours as Hotspots heat layers and Day View filters, date-range delete, capped route rewarm, and a timezone-skew warning (dates are not rewritten).

Product maps run on MapLibre (heatmap, journeys, playback, clustering). Vector styles and 3D buildings are optional via env. Map chrome unifies layers, heatmap, measure, and saved views. Custom raster XYZ is allowlisted for self-hosters.

Settings: signed-in session list and revoke, pause vs cancel billing copy (invoices stay in the Stripe portal), a labelled Danger zone for account delete, and a download-only GDPR pack ZIP of Timeline rows.

Command palette search (`Ctrl/Cmd+K`, mobile sheet), URL-synced Hotspots and Day Trips filters, GPS jump, on-device recents and filter presets, and `g h` / `[` `]` keyboard jumps.

Explore overflow (desktop rail and mobile More) with nested catalog pages: place directory and place pages, corridors, coverage, compare, time-lapse, month/week/on this day/gaps, year-in-review PNG, trip stories and named trips, commute, away nights, firsts, chapters, onboarding, import history, data health, staff console (own tenant counts, stuck imports, wipe runbook), in-app changelog, activity guesses, badges, and an optional heatmap globe.

Day View time scrubber and playback (estimated path along stays and predicted routes), sunrise/sunset ticks, overnight stay labels, and unknown-movement gap copy.

Insights and Day Trips: auto-named multi-day trips, flight tagged vs guessed counts, train hops, yearly driving vs transit miles, extra facts (longest day, farthest from home, most stops), and low-movement days. Existing tenants see the new stats after the next import.

Hotspots: place-type filters, visit vs time ranking, favourites, tags/colours, and a hidden-places manager.

Transactional email catalog (verify, OTP, magic link, import and billing status) via Resend. See [docs/product/email.md](product/email.md).

Documented a product idea catalog in [docs/product/ideas.md](product/ideas.md). Not a commitment to build.

## 1.2.0

Named Wrangler environments: `locations-staging` (push to `main`) and `locations` production (manual promote). Isolated R2, import queues, Neon, and Stripe per env.

## 1.1.0

Hosted SaaS foundation: public signup (kill switch `DISABLE_SIGNUP`), Stripe billing, FORCE RLS, import queue + zip, shadcn + Motion UI, docs tree, CI, account export/delete.

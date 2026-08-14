# Changelog

## Unreleased

Explore overflow (desktop rail and mobile More) with nested catalog pages: place directory and place pages, corridors, coverage, compare, time-lapse, month/week/on this day/gaps, year-in-review PNG, trip stories and named trips, commute, away nights, firsts, chapters, onboarding, import history, data health, staff console (own tenant counts), and an optional heatmap globe.

Day View time scrubber and playback (estimated path along stays and predicted routes), sunrise/sunset ticks, overnight stay labels, and unknown-movement gap copy.

Insights and Day Trips: auto-named multi-day trips, flight tagged vs guessed counts, train hops, yearly driving vs transit miles, extra facts (longest day, farthest from home, most stops), and low-movement days. Existing tenants see the new stats after the next import.

Hotspots: place-type filters, visit vs time ranking, favourites, tags/colours, and a hidden-places manager.

Transactional email catalog (verify, OTP, magic link, import and billing status) via Resend. See [docs/product/email.md](product/email.md).

Documented a product idea catalog in [docs/product/ideas.md](product/ideas.md). Not a commitment to build.

## 1.2.0

Named Wrangler environments: `locations-staging` (push to `main`) and `locations` production (manual promote). Isolated R2, import queues, Neon, and Stripe per env.

## 1.1.0

Hosted SaaS foundation: public signup (kill switch `DISABLE_SIGNUP`), Stripe billing, FORCE RLS, import queue + zip, shadcn + Motion UI, docs tree, CI, account export/delete.

# Journey cost

True trip cost for UK drivers: fuel or charging energy, tolls, and clean-air charges, for the car on your driveway, at the prices you would actually pay. It started as a separate app (Brim) and now lives inside Locations as the **Journey Cost** tab (`/journey-cost`).

It does not need imported Timeline data, so it is available before onboarding finishes.

## Sections

| Path | What it does |
|------|--------------|
| `/journey-cost` | Estimate a trip. Type an address or tap Pin and then the map. Pick a car (saved, from the VCA catalogue, from a UK registration, or typed in). Shows the total, a low/high band, energy, charges, CO2, the cheapest forecourt along the route, and the HMRC mileage allowance for the tax year. |
| `/journey-cost/garage` | Saved cars, EV tariffs, and fill-ups. Three brim-to-brim (or full-charge) fill-ups calibrate the car's real consumption, which then replaces the brochure figure. |
| `/journey-cost/history` | Saved journeys (frozen snapshots), the tax-year mileage tally, and a CSV export. |
| Settings > Journey cost | Home and work (one-tap trip ends), default car, calibration status, journey export. |

## Rules that carry over from Brim

- **No ads, no selling journey or location data.** Same as the rest of Locations.
- **An estimate, not a bill.** Charges come from a dated catalogue with an operator link; the driver stays responsible for paying or staying out.
- **Cars, vans, and motorcycles only.** HGV, bus, and taxi classes are not modelled.
- **Registration plates** are looked up on demand (DVLA VES), never cached by plate, and stored only encrypted on a saved car. See [architecture](../architecture/journey-cost.md#registration-plates).

## Demo account

The demo tenant is shared by every visitor, so it can estimate but cannot save cars, places, fill-ups, or journeys (403).

## Data sources

| Source | Used for | Refresh |
|--------|----------|---------|
| VCA car fuel data | Make / model / derivative consumption catalogue | `npm run brim:sync-vca` when VCA publishes |
| GOV.UK Fuel Finder | Forecourt pump prices | Worker cron every 20 minutes |
| National Grid ESO carbon intensity | EV CO2 per kWh | Worker cron every 20 minutes |
| Clean-air zone and toll GeoJSON (`data/brim/`) | ULEZ, Congestion Charge, CAZ, LEZ, Dart Charge, M6 Toll, Mersey Gateway, Tyne Tunnel | `npm run brim:load-zones`; `brim:verify-zones` fails when a zone is older than 180 days |
| Google Routes / Places (or OSRM) | Routing and address search | Per request, cached |
| DVLA VES | Registration lookup | Per request, not cached |
| Open-Meteo | Forecast temperature for EV range derating | Per request |

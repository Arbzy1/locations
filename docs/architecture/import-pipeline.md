# Import pipeline

## Browser import (website, default)

The Worker runs on the Cloudflare free plan: 10 ms of CPU per request. Parsing a 15 MB Timeline takes about 200 ms and computing analytics about 230 ms, so the website never sends the file to the Worker. Instead:

1. The browser parses the file (or Takeout zip, same bounds as the server) in a Web Worker (`apps/web/src/lib/import/import.worker.ts`) with the shared pure code in `@locations/db/pure` (`timeline-parse.ts`, `aggregates.ts`, `takeout-zip.ts`).
2. Preview is computed locally; `GET /api/import/existing?sourceId=` supplies the days already stored for overlap and skip-overlap.
3. `POST /api/import/start` (not demo, verified, entitlement, one active job, `maxSources`, `maxImportRows`) resolves or creates the source, clears it unless merging, and opens a `processing` job.
4. `POST /api/import/:jobId/rows` stores batches of at most 250 rows and 256 KB (the browser aims for 120 KB). Rows are validated field by field (`checkRowBatch`), then inserted with one `jsonb_to_recordset` statement, about 1 to 2 ms of CPU. Tenant and source come from the session and job, never the body. Unknown or other tenants' jobs are 404.
5. `POST /api/import/:jobId/finish` stores Google's `timelineMemory` trips as named trips, marks aggregates stale and the job ready, and sends `import_ready`.
6. The browser rebuilds aggregates (below).

Closing the tab mid-import leaves a partial source; the job goes stale after 15 minutes and re-importing replaces it.

## Aggregates rebuilt by the browser

`day_stats` and `analytics_cache` are computed by `computeTenantAggregates` (pure; inputs are sorted so results do not depend on row order). Worker paths that change rows (import, delete source, delete date range, retention, delete place, timezone change) call `markAggregatesStale` instead of rebuilding inline. The signed-in app checks `GET /api/aggregates/status`; when stale it pages `GET /api/aggregates/input?table=visits|activities&after=` (500 rows, no GPS paths), computes in the Web Worker and uploads `POST /api/aggregates` chunks (`reset` on the first, `done` on the last, which clears the flag). The CLI (`db:import`) still rebuilds inline (`aggregates: "rebuild"`). Rebuilds keep internal `_` keys in `analytics_cache` (the stale flag and `_mode_detection`).

## Transport mode from GPS points

Google often labels train trips "in passenger vehicle", so lines were drawn on roads. `packages/db/src/rail.ts` (pure) checks each journey's GPS fixes:

- **Rail:** journeys labelled car, bus or unknown with at least 4 fixes over 3 km become `train` (or `subway`) when 75% of fixes are within 80 m of a railway, the median distance is 50 m or less and the average speed is over 20 km/h. Weaker matches (60% / 80 m / 15 km/h) are stored as a "Might be a train" hint only. Tram track is ignored (it shares streets with cars). Tuned on a real export: 51 of 70 Google-labelled trains matched against 9 of about 1,700 cars and buses.
- **Speed:** walking faster than 15 km/h becomes cycling or car; car or bus slower than 6 km/h on average with every stretch under 12 km/h becomes walking; over 250 km/h for 50 km or more becomes flying. Traces far longer than the journey (fixes bouncing around one spot) are skipped.
- **Distance:** when Google's distance is less than half the straight line between the first and last GPS fixes (a "0.1 km" record of a 40 km train ride), `measuredDistanceM` replaces it with the rail line's length, else the cleaned fixes' length capped at 3x the straight line. On a real export this corrected 191 of 8,552 journeys. Google's figure is otherwise kept, so re-running changes nothing.
- **Rail lines:** `snapTraceToRail` follows the rail network between fixes (shortest path per leg) and stores up to 300 points in `activities.rail_geometry`; Day View and Routes draw it (`route_source: gps-rail`).

Rail lines come from static OpenStreetMap tiles under `/assets/rail/v1/` (built by `npm run rail:build`), which `run_worker_first` serves without invoking the Worker. Without them only the speed checks run.

A changed journey keeps Google's label in `activities.google_mode`, the reason in `mode_detail` (`{ mode, confidence, by, railPct, avgKmh, v }`), and `mode` holds the result, so mileage by mode, Routes and statistics all follow. Detection runs in the import Web Worker before upload and in the CLI import (tiles read from disk). Stored journeys are checked once per `MODE_DETECTOR_VERSION`: `GET /api/aggregates/status` returns `modeVersion`; when it is behind, the app pages `GET /api/journeys/detect-input` (200 GPS journeys, with flags for hand-corrected ones, which are skipped), detects in the Web Worker and sends only changed rows to `POST /api/journeys/modes` (one `UPDATE ... FROM jsonb_to_recordset`, tenant-scoped), then `doneVersion`. Changes mark aggregates stale. A mode correction (`PATCH /api/overrides`) now also updates the journey row; clearing it returns to Google's label.

Road lines also use the fixes: GPS spikes are dropped before map matching (`cleanTrace`), and a matched road line whose median distance from the fixes is over 80 m (or with under 70% of fixes within 100 m) is replaced by the fixes themselves (`roadFollowsFixes`).

## Upload import (legacy, small files)

1. `POST /api/import/preview` sniffs JSON or unzip (bounded). No R2 write and no DB insert. Response is counts, chosen file name, date overlap, and a timezone warning.
2. `POST /api/import` sniffs JSON or unzip (bounded), writes R2 `uploads/{userId}/{jobId}.json`, inserts `import_jobs` with `merge` and `chosen_file`.
3. The Worker publishes to the import queue for that environment (`locations-imports-staging` or `locations-imports`), or `waitUntil` if the queue binding is missing. The message may include `skipOverlappingDays`.
4. The consumer parses, replaces or merges the source (optionally skipping days already stored), rebuilds tenant aggregates, updates job counts, deletes the R2 object, and emails `import_ready` or `import_failed` (counts only; no place names). `import_jobs.notified_at` prevents a queue retry from sending twice.
5. The UI polls `GET /api/import/status` (includes `chosenFile` and `timezoneWarning`).

Zip extract prefers `Timeline.json`, then semantic JSON, then `Records.json`. Errors list JSON names found.

Progress fields: `status`, `parsedCount`, `visitCount`, `activityCount`, `chosenFile`, `error`.

`POST /api/routes/rewarm` warms up to 100 uncached walking/driving journeys for the session tenant. `GET /api/route-progress` counts cache hits for that tenant's activities only.

`DELETE /api/days?from=&to=&sourceId=` deletes visits and activities in the inclusive date window, then rebuilds aggregates. Demo 403. Unknown `sourceId` is 404.

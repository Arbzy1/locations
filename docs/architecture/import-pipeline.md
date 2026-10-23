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

`day_stats` and `analytics_cache` are computed by `computeTenantAggregates` (pure; inputs are sorted so results do not depend on row order). Worker paths that change rows (import, delete source, delete date range, retention, delete place, timezone change) call `markAggregatesStale` instead of rebuilding inline. The signed-in app checks `GET /api/aggregates/status`; when stale it pages `GET /api/aggregates/input?table=visits|activities&after=` (500 rows, no GPS paths), computes in the Web Worker and uploads `POST /api/aggregates` chunks (`reset` on the first, `done` on the last, which clears the flag). The CLI (`db:import`) still rebuilds inline (`aggregates: "rebuild"`).

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

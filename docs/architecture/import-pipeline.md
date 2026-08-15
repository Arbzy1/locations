# Import pipeline

1. `POST /api/import/preview` sniffs JSON or unzip (bounded). No R2 write and no DB insert. Response is counts, chosen file name, date overlap, and a timezone warning.
2. `POST /api/import` sniffs JSON or unzip (bounded), writes R2 `uploads/{userId}/{jobId}.json`, inserts `import_jobs` with `merge` and `chosen_file`.
3. The Worker publishes to the import queue for that environment (`locations-imports-staging` or `locations-imports`), or `waitUntil` if the queue binding is missing. The message may include `skipOverlappingDays`.
4. The consumer parses, replaces or merges the source (optionally skipping days already stored), rebuilds tenant aggregates, updates job counts, deletes the R2 object, and emails `import_ready` or `import_failed` (counts only; no place names). `import_jobs.notified_at` prevents a queue retry from sending twice.
5. The UI polls `GET /api/import/status` (includes `chosenFile` and `timezoneWarning`).

Zip extract prefers `Timeline.json`, then semantic JSON, then `Records.json`. Errors list JSON names found.

Progress fields: `status`, `parsedCount`, `visitCount`, `activityCount`, `chosenFile`, `error`.

`POST /api/routes/rewarm` warms up to 100 uncached walking/driving journeys for the session tenant. `GET /api/route-progress` counts cache hits for that tenant's activities only.

`DELETE /api/days?from=&to=&sourceId=` deletes visits and activities in the inclusive date window, then rebuilds aggregates. Demo 403. Unknown `sourceId` is 404.

# Import pipeline

1. `POST /api/import` sniffs JSON or unzip (bounded), writes R2 `uploads/{userId}/{jobId}.json`, inserts `import_jobs`.
2. The Worker publishes to the import queue for that environment (`locations-imports-staging` or `locations-imports`), or `waitUntil` if the queue binding is missing.
3. The consumer parses, replaces or merges the source, rebuilds tenant aggregates, updates job counts, deletes the R2 object.
4. The UI polls `GET /api/import/status`.

Progress fields: `status`, `parsedCount`, `visitCount`, `activityCount`, `error`.

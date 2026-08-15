# Stuck import

1. `GET /api/import/status` for the user.
2. If `processing` longer than 15 minutes, set status `error` and delete the R2 key.
3. Check queue consumer logs and Worker CPU limits.
4. Ask the user to retry; zip bombs should already have been rejected.

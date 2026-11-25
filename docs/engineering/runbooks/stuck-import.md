# Stuck import

1. Check `/admin/imports` (or `GET /api/import/status` for the user).
2. Browser imports write batches directly to Postgres (`import_job_id`) without R2 upload objects. Jobs with no batch activity for 15 minutes are automatically marked `error` and their uncommitted rows are deleted by the 20-minute housekeeping cron (or after 3 minutes when the user reopens import).
3. If an admin needs to unlock a stuck `pending` or `processing` job immediately, use **Fail stuck job** in `/admin/imports` (`POST /api/admin/imports/:userId/jobs/:jobId/fail` with `{ "confirm": "stuck" }`), which discards partial rows and notifies the user.
4. Ask the user to re-drop their Timeline JSON or Takeout `.zip` in Settings or Onboarding.

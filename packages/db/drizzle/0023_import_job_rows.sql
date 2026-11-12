-- Tag imported rows with the browser import job that wrote them. A "replace" import
-- now keeps the source's old rows until the job finishes, and a failed or abandoned
-- job's rows can be removed. Per tenant on existing tables, so FORCE RLS and GRANTs
-- already apply. Existing rows stay NULL.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS import_job_id text;
--> statement-breakpoint
ALTER TABLE activities ADD COLUMN IF NOT EXISTS import_job_id text;

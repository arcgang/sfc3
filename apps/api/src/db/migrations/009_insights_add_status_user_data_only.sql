-- 009_insights_add_status_user_data_only.sql
-- Adds status and user_data_only columns required by the recommendations schema.
-- ALTER TABLE … ADD COLUMN is append-only; safe to run against the existing insights table.

ALTER TABLE insights ADD COLUMN user_data_only INTEGER NOT NULL DEFAULT 1;
ALTER TABLE insights ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'done', 'dismissed'));

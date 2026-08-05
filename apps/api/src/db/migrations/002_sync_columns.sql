-- 002_sync_columns.sql
-- Adds last_successful_sync_at to device_connections (tracks last fully-successful sync).
-- Adds measurement_session_id and source_payload_hash to health_records
-- (required by the ingestion pipeline acceptance criteria).
--
-- All three columns are nullable; no backfill is required.
-- The migration runner guards against re-running via the _migrations table.

ALTER TABLE device_connections ADD COLUMN last_successful_sync_at TEXT;
ALTER TABLE health_records ADD COLUMN measurement_session_id TEXT;
ALTER TABLE health_records ADD COLUMN source_payload_hash TEXT;

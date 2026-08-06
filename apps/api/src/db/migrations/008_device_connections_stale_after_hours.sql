-- 008_device_connections_stale_after_hours.sql
-- Adds stale_after_hours to device_connections (per-device configurable freshness threshold).
-- Defaults to 18 hours per LLD section 7.3 ("Stale threshold default is 18 hours").
-- Nullable rows backfill to 18 via COALESCE at query time; no data migration required.

ALTER TABLE device_connections ADD COLUMN stale_after_hours INTEGER NOT NULL DEFAULT 18;

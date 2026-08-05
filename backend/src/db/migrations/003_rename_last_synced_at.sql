-- 003_rename_last_synced_at.sql
-- Renames last_synced_at to last_sync_at on device_connections.
-- SQLite >= 3.25 supports RENAME COLUMN.

ALTER TABLE device_connections RENAME COLUMN last_synced_at TO last_sync_at;

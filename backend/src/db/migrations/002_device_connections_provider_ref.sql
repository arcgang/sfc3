-- 002_device_connections_provider_ref.sql
-- Adds spec-required columns to device_connections.
-- SQLite ALTER TABLE does not allow NOT NULL without a DEFAULT, so provider and
-- connected_since use a sentinel default that existing rows (none in production
-- at this schema revision) would receive; new inserts supply the real values.

ALTER TABLE device_connections ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE device_connections ADD COLUMN device_name TEXT;
ALTER TABLE device_connections ADD COLUMN battery TEXT;
ALTER TABLE device_connections ADD COLUMN connected_since TEXT NOT NULL DEFAULT '';
ALTER TABLE device_connections ADD COLUMN provider_account_ref TEXT;

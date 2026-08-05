-- 004_device_connections_provider_ref.sql
-- Adds provider_account_ref to device_connections to record the external
-- provider account identifier used during pairing.

ALTER TABLE device_connections ADD COLUMN provider_account_ref TEXT;

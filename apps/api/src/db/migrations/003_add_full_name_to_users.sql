-- 003_add_full_name_to_users.sql
-- Adds the full_name column to users (required for registration and LLD contract).
-- SQLite requires a DEFAULT when adding a NOT NULL column to a populated table.
-- Empty string backfills any legacy rows; the application layer enforces non-empty.

ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT '';

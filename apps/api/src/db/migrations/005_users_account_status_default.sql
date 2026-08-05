-- 005_users_account_status_default.sql
-- Rebuild users table to add DEFAULT 'active' to account_status.
-- SQLite does not support ALTER COLUMN; we use CREATE-INSERT-DROP-RENAME.

CREATE TABLE users_new (
  id             TEXT NOT NULL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'active'
                     CHECK (account_status IN ('active', 'locked', 'pending_verification')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO users_new (id, email, password_hash, full_name, account_status, created_at, updated_at)
SELECT id, email, password_hash, full_name, account_status, created_at, updated_at
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

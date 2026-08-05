-- 001_initial_schema.sql
-- Foundation schema for apps/api: users, device_connections, sync_runs, health_records.
-- All statements use IF NOT EXISTS so re-running is safe.

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id             TEXT NOT NULL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'active'
                     CHECK (account_status IN ('active', 'locked', 'pending_verification')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_login_at  TEXT
);

-- 2. device_connections  (user_id → users.id)
CREATE TABLE IF NOT EXISTS device_connections (
  id                      TEXT NOT NULL PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type             TEXT NOT NULL
                              CHECK (device_type IN ('smartwatch', 'smart_scale')),
  device_name             TEXT NOT NULL DEFAULT '',
  provider                TEXT NOT NULL DEFAULT '',
  connection_status       TEXT NOT NULL DEFAULT 'pending'
                              CHECK (connection_status IN ('pending', 'connected', 'disconnected', 'error')),
  last_sync_at            TEXT,
  last_successful_sync_at TEXT,
  battery_level           TEXT,
  connected_since         TEXT NOT NULL DEFAULT '',
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, device_type)
);

CREATE INDEX IF NOT EXISTS idx_device_connections_user_type
  ON device_connections(user_id, device_type);

-- 3. sync_runs  (device_connection_id → device_connections.id)
CREATE TABLE IF NOT EXISTS sync_runs (
  id                   TEXT NOT NULL PRIMARY KEY,
  device_connection_id TEXT NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_status          TEXT NOT NULL
                           CHECK (sync_status IN ('succeeded', 'failed', 'partial_discard')),
  started_at           TEXT NOT NULL,
  finished_at          TEXT,
  error_message        TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_device_connection
  ON sync_runs(device_connection_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_user
  ON sync_runs(user_id, started_at DESC);

-- 4. health_records  (user_id → users.id, device_connection_id → device_connections.id)
CREATE TABLE IF NOT EXISTS health_records (
  id                   TEXT    NOT NULL PRIMARY KEY,
  user_id              TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_connection_id TEXT    NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
  measurement_session_id TEXT,
  source_type          TEXT    NOT NULL
                               CHECK (source_type IN ('smartwatch', 'smart_scale', 'user_input')),
  source_payload_hash  TEXT,
  recorded_at          TEXT    NOT NULL,
  payload              TEXT    NOT NULL DEFAULT '{}',
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_health_records_user_recorded_at
  ON health_records(user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_records_device_connection
  ON health_records(device_connection_id);

CREATE INDEX IF NOT EXISTS idx_health_records_session
  ON health_records(measurement_session_id);

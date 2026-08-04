-- 001_initial_schema.sql
-- Creates all 11 tables in dependency order with CHECK constraints,
-- foreign keys, unique constraints, and indexes.
-- Uses IF NOT EXISTS throughout so re-running is safe.

PRAGMA foreign_keys = ON;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        NOT NULL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  account_status TEXT       NOT NULL
                            CHECK (account_status IN ('active','locked','pending_verification')),
  created_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 2. profiles  (user_id → users.id)
CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT NOT NULL PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  persona_mode TEXT NOT NULL DEFAULT 'default'
                   CHECK (persona_mode IN ('default','fitness','elder_friendly','chronic_care_aware')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 3. device_connections  (user_id → users.id)
CREATE TABLE IF NOT EXISTS device_connections (
  id                TEXT NOT NULL PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type       TEXT NOT NULL
                        CHECK (device_type IN ('smartwatch','smart_scale')),
  connection_status TEXT NOT NULL
                        CHECK (connection_status IN ('connected','disconnected','error')),
  last_synced_at    TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (user_id, device_type)
);

CREATE INDEX IF NOT EXISTS idx_device_connections_user_type
  ON device_connections(user_id, device_type);

-- 4. sync_runs  (device_connection_id → device_connections.id)
CREATE TABLE IF NOT EXISTS sync_runs (
  id                   TEXT NOT NULL PRIMARY KEY,
  device_connection_id TEXT NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
  sync_status          TEXT NOT NULL
                           CHECK (sync_status IN ('started','succeeded','failed','partial_discard')),
  started_at           TEXT NOT NULL,
  finished_at          TEXT,
  records_written      INTEGER,
  records_discarded    INTEGER,
  error_message        TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_connection_started
  ON sync_runs(device_connection_id, started_at);

-- 5. health_records  (user_id → users.id, device_connection_id → device_connections.id)
CREATE TABLE IF NOT EXISTS health_records (
  id                   TEXT    NOT NULL PRIMARY KEY,
  user_id              TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_connection_id TEXT    NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
  metric_domain        TEXT    NOT NULL
                               CHECK (metric_domain IN ('vitals','activity','sleep','body_composition')),
  source_type          TEXT    NOT NULL
                               CHECK (source_type IN ('smartwatch','smart_scale','user_input')),
  metric_name          TEXT    NOT NULL,
  value                NUMERIC NOT NULL,
  unit                 TEXT,
  recorded_at          TEXT    NOT NULL,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_health_records_user_domain_time
  ON health_records(user_id, metric_domain, recorded_at);

-- 6. goals  (user_id → users.id)
CREATE TABLE IF NOT EXISTS goals (
  id         TEXT    NOT NULL PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_type  TEXT    NOT NULL
                     CHECK (goal_type IN ('steps_daily','sleep_minutes_daily','weight_target','active_minutes_weekly')),
  cadence    TEXT    NOT NULL
                     CHECK (cadence IN ('daily','weekly')),
  status     TEXT    NOT NULL
                     CHECK (status IN ('active','on_track','behind','completed','archived')),
  target     NUMERIC,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_user_status
  ON goals(user_id, status);

-- 7. alerts  (user_id → users.id, goal_id → goals.id nullable, health_record_id → health_records.id nullable)
CREATE TABLE IF NOT EXISTS alerts (
  id               TEXT NOT NULL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id          TEXT REFERENCES goals(id) ON DELETE SET NULL,
  health_record_id TEXT REFERENCES health_records(id) ON DELETE SET NULL,
  category         TEXT NOT NULL
                       CHECK (category IN ('stale_data','abnormal_reading','goal_risk','sync_failure')),
  priority         TEXT NOT NULL
                       CHECK (priority IN ('high','medium','low')),
  message          TEXT NOT NULL,
  acknowledged_at  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_priority_ack
  ON alerts(user_id, priority, acknowledged_at);

-- 8. insights  (user_id → users.id, goal_id → goals.id nullable)
CREATE TABLE IF NOT EXISTS insights (
  id             TEXT NOT NULL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id        TEXT REFERENCES goals(id) ON DELETE SET NULL,
  insight_type   TEXT NOT NULL
                     CHECK (insight_type IN ('trend_summary','recommendation','nudge')),
  generator_name TEXT NOT NULL
                     CHECK (generator_name IN ('Recommendation Engine','AI Wellness Coach Deferred Reference')),
  content        TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_insights_user_created
  ON insights(user_id, created_at);

-- 9. engagement_events  (user_id → users.id)
CREATE TABLE IF NOT EXISTS engagement_events (
  id         TEXT NOT NULL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
                 CHECK (event_type IN ('login','dashboard_view','goal_create','goal_view','alert_view','device_sync','nudge_dismiss')),
  occurred_at TEXT NOT NULL,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_engagement_events_user_date
  ON engagement_events(user_id, occurred_at);

-- 10. partner_services  (no FKs)
CREATE TABLE IF NOT EXISTS partner_services (
  id                 TEXT NOT NULL PRIMARY KEY,
  name               TEXT NOT NULL,
  marketplace_status TEXT NOT NULL
                         CHECK (marketplace_status IN ('deferred','future_ready')),
  description        TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 11. privacy_requests  (user_id → users.id)
CREATE TABLE IF NOT EXISTS privacy_requests (
  id             TEXT NOT NULL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type   TEXT NOT NULL
                     CHECK (request_type IN ('export','delete')),
  request_status TEXT NOT NULL
                     CHECK (request_status IN ('requested','processing','completed','rejected')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- 003_alerts_add_acknowledged_columns.sql
-- Migration 001 created the alerts table with a TEXT primary key and no acknowledged column.
-- Migration 002's CREATE TABLE IF NOT EXISTS was a no-op because the table already existed.
-- This migration rebuilds the alerts table to match the schema AlertDao requires:
--   INTEGER PRIMARY KEY AUTOINCREMENT id, acknowledged INTEGER, rule_key, entity_id, entity_type.
-- Uses the SQLite CREATE-INSERT-DROP-RENAME pattern.
-- Note: the migrate runner already wraps each file in a transaction; no BEGIN/COMMIT needed here.

CREATE TABLE alerts_v2 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category         TEXT    NOT NULL CHECK (category IN ('stale_data', 'abnormal_reading', 'goal_risk', 'sync_failure')),
  priority         TEXT    NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  message          TEXT    NOT NULL,
  rule_key         TEXT,
  entity_id        TEXT,
  entity_type      TEXT,
  acknowledged     INTEGER NOT NULL DEFAULT 0,
  acknowledged_at  TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO alerts_v2 (user_id, category, priority, message, acknowledged_at, created_at)
SELECT user_id, category, priority, message, acknowledged_at, created_at
FROM alerts;

DROP TABLE alerts;

ALTER TABLE alerts_v2 RENAME TO alerts;

CREATE INDEX IF NOT EXISTS idx_alerts_user_priority_ack
  ON alerts(user_id, priority, acknowledged, created_at DESC);

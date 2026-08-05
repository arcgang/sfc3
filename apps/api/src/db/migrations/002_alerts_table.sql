-- 002_alerts_table.sql
-- Health Alerts table. Uses IF NOT EXISTS so re-running is safe.

CREATE TABLE IF NOT EXISTS alerts (
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

CREATE INDEX IF NOT EXISTS idx_alerts_user_priority_ack
  ON alerts(user_id, priority, acknowledged, created_at DESC);

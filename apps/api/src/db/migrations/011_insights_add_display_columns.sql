-- 011_insights_add_display_columns.sql
-- Adds display columns required by the insight generator: category, title, narrative,
-- icon, link_label, link_type, and generated_at.
-- All new columns are nullable TEXT so existing rows are unaffected.
-- Uses the SQLite CREATE-INSERT-DROP-RENAME pattern for schema changes.
-- The migration runner wraps this in its own transaction; no explicit BEGIN/COMMIT here.

CREATE TABLE insights_new (
  id             TEXT NOT NULL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id        TEXT REFERENCES goals(id) ON DELETE SET NULL,
  insight_type   TEXT NOT NULL
                     CHECK (insight_type IN ('trend_summary','recommendation','nudge')),
  generator_name TEXT
                     CHECK (generator_name IS NULL OR generator_name IN ('Recommendation Engine','AI Wellness Coach Deferred Reference')),
  content        TEXT NOT NULL,
  user_data_only INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','done','dismissed')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  category       TEXT,
  title          TEXT,
  narrative      TEXT,
  icon           TEXT,
  link_label     TEXT,
  link_type      TEXT,
  generated_at   TEXT,
  UNIQUE (user_id, content)
);

INSERT INTO insights_new
  (id, user_id, goal_id, insight_type, generator_name, content,
   user_data_only, status, created_at, updated_at)
SELECT
  id, user_id, goal_id, insight_type, generator_name, content,
  user_data_only, status, created_at, updated_at
FROM insights;

DROP TABLE insights;

ALTER TABLE insights_new RENAME TO insights;

CREATE INDEX IF NOT EXISTS idx_insights_user_created
  ON insights(user_id, created_at DESC);

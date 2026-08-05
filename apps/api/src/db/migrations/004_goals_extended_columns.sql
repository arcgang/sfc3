-- 004_goals_extended_columns.sql
-- Extends the goals table with the columns required by the GoalProgressCalculator
-- (name, icon, metric_domain, metric_type, end_date) and creates goal_insights.
-- All new goals columns are nullable so existing rows need no backfill.

ALTER TABLE goals ADD COLUMN name TEXT;
ALTER TABLE goals ADD COLUMN icon TEXT;
ALTER TABLE goals ADD COLUMN metric_domain TEXT;
ALTER TABLE goals ADD COLUMN metric_type TEXT;
ALTER TABLE goals ADD COLUMN end_date TEXT;

CREATE TABLE IF NOT EXISTS goal_insights (
  id           TEXT NOT NULL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id      TEXT REFERENCES goals(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  insight_type TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_goal_insights_user_created
  ON goal_insights(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goal_insights_goal
  ON goal_insights(goal_id);

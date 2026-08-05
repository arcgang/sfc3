-- 003_goals_engagement_columns.sql
-- Adds columns required by the POST /api/v1/goals contract.
-- Additive only: existing rows and constraints are untouched.

-- goals: add target_value, target_unit, and start_date.
-- NOTE: migration 001 defined a nullable 'target NUMERIC' column on this table.
-- That column is superseded by 'target_value'; all application code writes to
-- target_value and never reads target. target is scheduled for removal in a
-- subsequent expand-then-contract migration once all environments have applied this one.
ALTER TABLE goals ADD COLUMN target_value REAL NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN target_unit TEXT NOT NULL DEFAULT '';
ALTER TABLE goals ADD COLUMN start_date TEXT NOT NULL DEFAULT '';

-- engagement_events: add event_date, event_timestamp, event_context_json
-- alongside the existing occurred_at/metadata columns (expand only).
ALTER TABLE engagement_events ADD COLUMN event_date TEXT NOT NULL DEFAULT '';
ALTER TABLE engagement_events ADD COLUMN event_timestamp TEXT NOT NULL DEFAULT '';
ALTER TABLE engagement_events ADD COLUMN event_context_json TEXT NOT NULL DEFAULT '{}';

-- 007_profiles_persona_mode_expand.sql
-- Expands the profiles.persona_mode CHECK constraint to include the new
-- persona mode values introduced by the Profile and Persona Module spec:
-- 'everyday_wellness', 'active_fitness'.
-- The prior values are retained so existing rows remain valid.
-- Uses CREATE-INSERT-DROP-RENAME because SQLite does not support ALTER COLUMN.

CREATE TABLE IF NOT EXISTS profiles_new (
  id                       TEXT    NOT NULL PRIMARY KEY,
  user_id                  TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  persona_mode             TEXT    NOT NULL DEFAULT 'default'
                                   CHECK (persona_mode IN (
                                     'default',
                                     'fitness',
                                     'elder_friendly',
                                     'chronic_care_aware',
                                     'everyday_wellness',
                                     'active_fitness'
                                   )),
  full_name                TEXT    NOT NULL DEFAULT '',
  date_of_birth            TEXT,
  gender                   TEXT,
  wellness_preferences     TEXT    NOT NULL DEFAULT '[]',
  focus_areas_json         TEXT    NOT NULL DEFAULT '[]',
  target_steps             INTEGER,
  privacy_policy_accepted  INTEGER NOT NULL DEFAULT 0,
  data_export_requested    INTEGER NOT NULL DEFAULT 0,
  data_deletion_requested  INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT INTO profiles_new (
  id, user_id, persona_mode,
  full_name, date_of_birth, gender,
  wellness_preferences, focus_areas_json, target_steps,
  privacy_policy_accepted, data_export_requested, data_deletion_requested,
  created_at, updated_at
)
SELECT
  id, user_id, persona_mode,
  full_name, date_of_birth, gender,
  wellness_preferences, focus_areas_json, target_steps,
  privacy_policy_accepted, data_export_requested, data_deletion_requested,
  created_at, updated_at
FROM profiles;

DROP TABLE profiles;

ALTER TABLE profiles_new RENAME TO profiles;

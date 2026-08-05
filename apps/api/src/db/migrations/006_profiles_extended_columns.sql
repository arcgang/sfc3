-- 006_profiles_extended_columns.sql
-- Extends the profiles table with columns required by the onboarding profile flow:
-- full_name, date_of_birth, gender, wellness_preferences (JSON array),
-- focus_areas_json, target_steps, and privacy tracking flags.
-- All new columns are nullable or have defaults so existing rows need no backfill.

ALTER TABLE profiles ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN date_of_birth TEXT;
ALTER TABLE profiles ADD COLUMN gender TEXT;
ALTER TABLE profiles ADD COLUMN wellness_preferences TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN focus_areas_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN target_steps INTEGER;
ALTER TABLE profiles ADD COLUMN privacy_policy_accepted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN data_export_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN data_deletion_requested INTEGER NOT NULL DEFAULT 0;

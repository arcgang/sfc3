-- 002_partner_services_seed.sql
-- Adds category, short_description, and premium_required columns to partner_services,
-- then inserts the 8 seeded services required by the Partners & Services discovery screen.

ALTER TABLE partner_services ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_services ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_services ADD COLUMN premium_required INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO partner_services (id, name, category, short_description, premium_required, marketplace_status, created_at)
VALUES
  ('ps-fitpro',    'FitPro Training',    'Fitness',       'Personalised fitness coaching plans built around your daily step and activity data.',            0, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-nutri',     'NutriGuide',         'Nutrition',     'AI-assisted meal planning and macro tracking aligned with your wellness goals.',                 1, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-mindful',   'MindfulMe',          'Mental Health', 'Guided meditations and stress-management exercises integrated with your sleep data.',            0, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-sleep',     'SleepWell Program',  'Sleep',         'Evidence-based sleep hygiene programme with nightly routines and trend coaching.',               1, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-strength',  'Strength Builder',   'Fitness',       'Progressive overload strength programmes that adapt to your recovery and activity metrics.',     0, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-runcoach',  'RunCoach',           'Fitness',       'Structured running plans from 5K to marathon distance, paced to your heart-rate zones.',        1, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-wellness',  'Wellness Coaching',  'Nutrition',     'One-to-one nutrition and lifestyle coaching sessions with certified wellness professionals.',    0, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ps-stress',    'Stress Relief',      'Mental Health', 'Breathing, body-scan, and CBT-lite exercises triggered by your elevated resting heart rate.',    1, 'deferred', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

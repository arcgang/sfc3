-- 002_partner_services_seed.sql
-- Adds category, short_description, and premium_required columns to partner_services,
-- then inserts the 8 seeded services required by the Partners & Services discovery screen.
--
-- Idempotency: partner_services is recreated via a temp table so ADD COLUMN is never
-- needed. The INSERT OR IGNORE on seed rows is safe to re-run at any time.

CREATE TABLE IF NOT EXISTS partner_services_v2 (
  id                 TEXT    NOT NULL PRIMARY KEY,
  name               TEXT    NOT NULL,
  category           TEXT    NOT NULL DEFAULT '',
  short_description  TEXT    NOT NULL DEFAULT '',
  premium_required   INTEGER NOT NULL DEFAULT 0,
  marketplace_status TEXT    NOT NULL
                             CHECK (marketplace_status IN ('deferred','future_ready')),
  revenue_model_ref  TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT OR IGNORE INTO partner_services_v2 (id, name, category, short_description, premium_required, marketplace_status, created_at)
SELECT id, name, '' , COALESCE(description, ''), 0, marketplace_status, created_at
FROM partner_services
WHERE id NOT IN (SELECT id FROM partner_services_v2);

DROP TABLE IF EXISTS partner_services;
ALTER TABLE partner_services_v2 RENAME TO partner_services;

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

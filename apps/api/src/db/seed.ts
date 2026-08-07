import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import bcryptjs from "bcryptjs";
import { getDatabase } from "./connection.js";
import { migrate } from "./migrate.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
migrate(migrationsDir);

const db = getDatabase();

// Fixed IDs so the script is idempotent across runs
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_PROFILE_ID = "00000000-0000-0000-0000-000000000002";
const SMARTWATCH_ID = "00000000-0000-0000-0000-000000000010";
const SCALE_ID = "00000000-0000-0000-0000-000000000011";
const SYNC_RUN_1 = "00000000-0000-0000-0000-000000000020";
const SYNC_RUN_2 = "00000000-0000-0000-0000-000000000021";

const now = new Date().toISOString();

// Anchor for relative timestamps — 14 days ago
const anchor = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
function daysAgo(n: number): string {
  return new Date(anchor.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

// ---------- 1. Users ----------
const passwordHash = bcryptjs.hashSync("Demo1234!", 10);
db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, full_name, account_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, 'active', ?, ?)
`).run(DEMO_USER_ID, "demo@wellnesshub.com", passwordHash, "Alex Demo", now, now);

// ---------- 2. Profiles (one per persona_mode value) ----------
const personaModes = [
  "default",
  "fitness",
  "elder_friendly",
  "chronic_care_aware",
  "everyday_wellness",
  "active_fitness",
] as const;

// Primary profile for the demo user
db.prepare(`
  INSERT OR IGNORE INTO profiles
    (id, user_id, persona_mode, full_name, date_of_birth, gender,
     wellness_preferences, focus_areas_json, target_steps,
     privacy_policy_accepted, created_at, updated_at)
  VALUES (?, ?, 'everyday_wellness', ?, '1990-05-15', 'non_binary',
          '["steps","sleep","nutrition"]', '["cardio","mindfulness"]', 8000,
          1, ?, ?)
`).run(DEMO_PROFILE_ID, DEMO_USER_ID, "Alex Demo", now, now);

// Additional users + profiles for remaining persona_mode values
for (let i = 0; i < personaModes.length; i++) {
  const mode = personaModes[i];
  const uid = `00000000-0000-0000-0000-00000000${String(100 + i).padStart(4, "0")}`;
  const pid = `00000000-0000-0000-0000-00000001${String(100 + i).padStart(4, "0")}`;
  const email = `demo-${mode.replace(/_/g, "-")}@wellnesshub.com`;
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, account_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(uid, email, passwordHash, `Demo ${mode}`, now, now);
  db.prepare(`
    INSERT OR IGNORE INTO profiles
      (id, user_id, persona_mode, full_name, privacy_policy_accepted, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(pid, uid, mode, `Demo ${mode}`, now, now);
}

// ---------- 3. Device connections ----------
db.prepare(`
  INSERT OR IGNORE INTO device_connections
    (id, user_id, device_type, device_name, provider, connection_status,
     last_sync_at, last_successful_sync_at, battery_level, connected_since,
     stale_after_hours, created_at, updated_at)
  VALUES (?, ?, 'smartwatch', 'Apple Watch Series 9', 'apple_health', 'connected',
          ?, ?, '82%', ?, 18, ?, ?)
`).run(
  SMARTWATCH_ID, DEMO_USER_ID,
  daysAgo(0), daysAgo(0), daysAgo(0), now, now,
);

db.prepare(`
  INSERT OR IGNORE INTO device_connections
    (id, user_id, device_type, device_name, provider, connection_status,
     last_sync_at, last_successful_sync_at, battery_level, connected_since,
     stale_after_hours, created_at, updated_at)
  VALUES (?, ?, 'smart_scale', 'Withings Body+', 'withings', 'disconnected',
          ?, NULL, NULL, ?, 24, ?, ?)
`).run(
  SCALE_ID, DEMO_USER_ID,
  daysAgo(3), daysAgo(7), now, now,
);

// ---------- 4. Sync runs ----------
db.prepare(`
  INSERT OR IGNORE INTO sync_runs
    (id, device_connection_id, sync_status, started_at, finished_at,
     records_written, records_discarded, created_at, updated_at)
  VALUES (?, ?, 'succeeded', ?, ?, 42, 0, ?, ?)
`).run(SYNC_RUN_1, SMARTWATCH_ID, daysAgo(0), daysAgo(0), now, now);

db.prepare(`
  INSERT OR IGNORE INTO sync_runs
    (id, device_connection_id, sync_status, started_at, finished_at,
     records_written, records_discarded, error_message, created_at, updated_at)
  VALUES (?, ?, 'failed', ?, NULL, 0, 0, 'Connection timeout after 30s', ?, ?)
`).run(SYNC_RUN_2, SCALE_ID, daysAgo(3), now, now);

// ---------- 5. Health records — all four metric_domain values, 14 days ----------
const healthRows: Array<{
  domain: string;
  source: string;
  deviceId: string;
  metric: string;
  unit: string;
  values: number[];
}> = [
  {
    domain: "vitals",
    source: "smartwatch",
    deviceId: SMARTWATCH_ID,
    metric: "heart_rate_avg",
    unit: "bpm",
    values: [68, 71, 70, 74, 67, 69, 72, 65, 73, 70, 68, 71, 69, 72],
  },
  {
    domain: "activity",
    source: "smartwatch",
    deviceId: SMARTWATCH_ID,
    metric: "steps",
    unit: "steps",
    values: [7800, 9200, 10400, 6500, 11200, 8900, 7300, 10100, 9500, 8700, 11000, 7600, 9800, 10200],
  },
  {
    domain: "activity",
    source: "smartwatch",
    deviceId: SMARTWATCH_ID,
    metric: "active_minutes",
    unit: "minutes",
    values: [32, 45, 58, 21, 65, 44, 29, 55, 48, 40, 62, 33, 50, 57],
  },
  {
    domain: "sleep",
    source: "smartwatch",
    deviceId: SMARTWATCH_ID,
    metric: "sleep_minutes",
    unit: "minutes",
    values: [412, 438, 465, 390, 450, 420, 400, 455, 445, 430, 460, 395, 440, 475],
  },
  {
    domain: "body_composition",
    source: "smart_scale",
    deviceId: SCALE_ID,
    metric: "weight",
    unit: "lbs",
    values: [178.2, 177.9, 177.8, 177.6, 177.5, 177.3, 177.4, 177.2, 177.0, 176.9, 176.8, 176.6, 176.5, 176.4],
  },
];

const insertHealth = db.prepare(`
  INSERT OR IGNORE INTO health_records
    (id, user_id, device_connection_id, metric_domain, source_type,
     metric_name, value, unit, recorded_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const row of healthRows) {
  for (let day = 0; day < row.values.length; day++) {
    insertHealth.run(
      randomUUID(),
      DEMO_USER_ID,
      row.deviceId,
      row.domain,
      row.source,
      row.metric,
      row.values[day],
      row.unit,
      daysAgo(day),
      now,
      now,
    );
  }
}

// ---------- 6. Goals — all goal_type and cadence values ----------
const GOAL_STEPS_ID = "00000000-0000-0000-0000-000000000030";
const GOAL_SLEEP_ID = "00000000-0000-0000-0000-000000000031";
const GOAL_WEIGHT_ID = "00000000-0000-0000-0000-000000000032";
const GOAL_ACTIVE_ID = "00000000-0000-0000-0000-000000000033";

const goalRows = [
  {
    id: GOAL_STEPS_ID,
    goalType: "steps_daily",
    targetValue: 10000,
    targetUnit: "steps",
    cadence: "daily",
    status: "on_track",
    startDate: daysAgo(14).slice(0, 10),
    endDate: null,
    name: "Walk 10,000 steps daily",
    icon: "👟",
    metricDomain: "activity",
    metricType: "steps",
  },
  {
    id: GOAL_SLEEP_ID,
    goalType: "sleep_minutes_daily",
    targetValue: 420,
    targetUnit: "minutes",
    cadence: "daily",
    status: "active",
    startDate: daysAgo(14).slice(0, 10),
    endDate: null,
    name: "Sleep 7+ hours nightly",
    icon: "😴",
    metricDomain: "sleep",
    metricType: "sleep_minutes",
  },
  {
    id: GOAL_WEIGHT_ID,
    goalType: "weight_target",
    targetValue: 172.0,
    targetUnit: "lbs",
    cadence: "daily",
    status: "behind",
    startDate: daysAgo(14).slice(0, 10),
    endDate: daysAgo(-16).slice(0, 10),
    name: "Reach target weight",
    icon: "⚖️",
    metricDomain: "body_composition",
    metricType: "weight",
  },
  {
    id: GOAL_ACTIVE_ID,
    goalType: "active_minutes_weekly",
    targetValue: 150,
    targetUnit: "minutes",
    cadence: "weekly",
    status: "active",
    startDate: daysAgo(7).slice(0, 10),
    endDate: null,
    name: "Exercise 150 minutes weekly",
    icon: "🏃",
    metricDomain: "activity",
    metricType: "active_minutes",
  },
] as const;

const insertGoal = db.prepare(`
  INSERT OR IGNORE INTO goals
    (id, user_id, goal_type, target_value, target_unit, cadence,
     status, start_date, end_date, name, icon, metric_domain, metric_type,
     created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const g of goalRows) {
  insertGoal.run(
    g.id, DEMO_USER_ID, g.goalType, g.targetValue, g.targetUnit,
    g.cadence, g.status, g.startDate, g.endDate,
    g.name, g.icon, g.metricDomain, g.metricType,
    now, now,
  );
}

// ---------- 7. Goal insights ----------
db.prepare(`
  INSERT OR IGNORE INTO goal_insights
    (id, user_id, goal_id, title, body, insight_type, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "00000000-0000-0000-0000-000000000040",
  DEMO_USER_ID,
  GOAL_STEPS_ID,
  "Consistency Pays Off",
  "You've hit your step goal 5 days in a row. Keep it up to reach your monthly activity target ahead of schedule.",
  "recommendation",
  now,
);

db.prepare(`
  INSERT OR IGNORE INTO goal_insights
    (id, user_id, goal_id, title, body, insight_type, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "00000000-0000-0000-0000-000000000041",
  DEMO_USER_ID,
  GOAL_WEIGHT_ID,
  "Weight Loss Strategy",
  "To get back on track, try increasing weekly exercise by 30 minutes and tracking calorie intake.",
  "recommendation",
  now,
);

// ---------- 8. Alerts — all four categories, acknowledged and unacknowledged ----------
const insertAlert = db.prepare(`
  INSERT OR IGNORE INTO alerts
    (user_id, category, priority, message, rule_key, entity_id, entity_type,
     acknowledged, acknowledged_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Check if any seed alerts already exist to keep idempotency
const alertCount = (db.prepare("SELECT COUNT(*) AS cnt FROM alerts WHERE user_id = ?").get(DEMO_USER_ID) as { cnt: number }).cnt;
if (alertCount === 0) {
  insertAlert.run(DEMO_USER_ID, "stale_data", "medium",
    "Your smart scale has not synced in over 3 days. Please reconnect.",
    "stale_data.smart_scale", SCALE_ID, "device_connection",
    0, null, daysAgo(1));

  insertAlert.run(DEMO_USER_ID, "abnormal_reading", "high",
    "Resting heart rate of 102 bpm detected — above your normal range.",
    "abnormal_reading.heart_rate", null, null,
    0, null, daysAgo(2));

  insertAlert.run(DEMO_USER_ID, "goal_risk", "medium",
    "You are behind on your weight target goal. Only 4 lbs lost of 6 lbs goal.",
    "goal_risk.weight_target", GOAL_WEIGHT_ID, "goal",
    1, daysAgo(0), daysAgo(5));

  insertAlert.run(DEMO_USER_ID, "sync_failure", "low",
    "Smart scale sync failed: connection timeout. Data may be incomplete.",
    "sync_failure.smart_scale", SCALE_ID, "device_connection",
    1, daysAgo(2), daysAgo(3));
}

// ---------- 9. Insights — all three insight_type values ----------
const insightRows = [
  {
    id: "00000000-0000-0000-0000-000000000050",
    insightType: "trend_summary",
    generatorName: "Recommendation Engine",
    content: "Your average daily steps increased 12% over the past 7 days compared to the prior week.",
    category: "activity",
    title: "Step Trend Improving",
    narrative: "Great momentum — you averaged 9,400 steps/day this week vs 8,400 last week.",
    icon: "📈",
    linkLabel: "View activity history",
    linkType: "internal",
    generatedAt: daysAgo(0),
  },
  {
    id: "00000000-0000-0000-0000-000000000051",
    insightType: "recommendation",
    generatorName: "Recommendation Engine",
    content: "Adding a 20-minute evening walk could close your daily step gap and support your weight goal.",
    category: "activity",
    title: "Evening Walk Recommendation",
    narrative: "A short walk after dinner adds ~2,000 steps and supports metabolic health.",
    icon: "🚶",
    linkLabel: "Set a reminder",
    linkType: "action",
    generatedAt: daysAgo(1),
  },
  {
    id: "00000000-0000-0000-0000-000000000052",
    insightType: "nudge",
    generatorName: null,
    content: "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    category: "activity",
    title: "Quick Lunchtime Walk",
    narrative: "Short activity breaks improve energy and focus throughout the afternoon.",
    icon: "👟",
    linkLabel: null,
    linkType: null,
    generatedAt: daysAgo(0),
  },
  {
    id: "00000000-0000-0000-0000-000000000053",
    insightType: "nudge",
    generatorName: null,
    content: "Consider setting a consistent bedtime of 10:30 PM to maintain your improved sleep schedule.",
    category: "sleep",
    title: "Sleep Consistency Tip",
    narrative: "A consistent bedtime helps regulate your circadian rhythm.",
    icon: "🌙",
    linkLabel: null,
    linkType: null,
    generatedAt: daysAgo(0),
  },
  {
    id: "00000000-0000-0000-0000-000000000054",
    insightType: "trend_summary",
    generatorName: "Recommendation Engine",
    content: "Your sleep duration averaged 7h 22m this week — up from 6h 55m the week prior.",
    category: "sleep",
    title: "Sleep Duration Trending Up",
    narrative: "You are getting closer to your 7-hour sleep goal each night.",
    icon: "😴",
    linkLabel: "View sleep history",
    linkType: "internal",
    generatedAt: daysAgo(2),
  },
] as const;

const insertInsight = db.prepare(`
  INSERT OR IGNORE INTO insights
    (id, user_id, goal_id, insight_type, generator_name, content,
     user_data_only, status, category, title, narrative, icon,
     link_label, link_type, generated_at, created_at, updated_at)
  VALUES (?, ?, NULL, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const ins of insightRows) {
  insertInsight.run(
    ins.id, DEMO_USER_ID,
    ins.insightType, ins.generatorName, ins.content,
    ins.category, ins.title, ins.narrative, ins.icon,
    ins.linkLabel, ins.linkType, ins.generatedAt,
    now, now,
  );
}

// ---------- 10. Engagement events — all seven event_type values ----------
const eventTypes = [
  "login",
  "dashboard_view",
  "goal_create",
  "goal_view",
  "alert_view",
  "device_sync",
  "nudge_dismiss",
] as const;

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO engagement_events
    (id, user_id, event_type, occurred_at, event_date, event_timestamp,
     event_context_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const engagementIds = [
  "00000000-0000-0000-0000-000000000060",
  "00000000-0000-0000-0000-000000000061",
  "00000000-0000-0000-0000-000000000062",
  "00000000-0000-0000-0000-000000000063",
  "00000000-0000-0000-0000-000000000064",
  "00000000-0000-0000-0000-000000000065",
  "00000000-0000-0000-0000-000000000066",
];

for (let i = 0; i < eventTypes.length; i++) {
  const ts = daysAgo(i);
  insertEvent.run(
    engagementIds[i],
    DEMO_USER_ID,
    eventTypes[i],
    ts,
    ts.slice(0, 10),
    ts,
    "{}",
    now,
    now,
  );
}

// ---------- 11. Partner services — eight services from wireframe ----------
const partnerServices = [
  {
    id: "00000000-0000-0000-0000-000000000070",
    name: "FitPro Training",
    description: "Personalised strength and cardio programmes built around your activity data.",
    category: "fitness",
    shortDescription: "Personalised workout plans",
    premiumRequired: 0,
    marketplaceStatus: "future_ready",
  },
  {
    id: "00000000-0000-0000-0000-000000000071",
    name: "NutriGuide",
    description: "AI-powered nutrition coaching with meal plans tailored to your health goals.",
    category: "nutrition",
    shortDescription: "AI nutrition coaching",
    premiumRequired: 1,
    marketplaceStatus: "future_ready",
  },
  {
    id: "00000000-0000-0000-0000-000000000072",
    name: "MindfulMe",
    description: "Guided meditation and stress management sessions integrated with your wellness data.",
    category: "mental_health",
    shortDescription: "Meditation & mindfulness",
    premiumRequired: 0,
    marketplaceStatus: "future_ready",
  },
  {
    id: "00000000-0000-0000-0000-000000000073",
    name: "SleepWell Program",
    description: "Evidence-based sleep improvement programme with nightly coaching and tracking.",
    category: "sleep",
    shortDescription: "Sleep improvement programme",
    premiumRequired: 1,
    marketplaceStatus: "future_ready",
  },
  {
    id: "00000000-0000-0000-0000-000000000074",
    name: "Strength Builder",
    description: "Progressive resistance training plans designed to build functional strength safely.",
    category: "fitness",
    shortDescription: "Progressive strength training",
    premiumRequired: 0,
    marketplaceStatus: "deferred",
  },
  {
    id: "00000000-0000-0000-0000-000000000075",
    name: "RunCoach",
    description: "Adaptive running plans from 5K to marathon distance, synced with your device data.",
    category: "fitness",
    shortDescription: "Adaptive running plans",
    premiumRequired: 0,
    marketplaceStatus: "deferred",
  },
  {
    id: "00000000-0000-0000-0000-000000000076",
    name: "Wellness Coaching",
    description: "One-to-one virtual sessions with a certified wellness coach for holistic health support.",
    category: "coaching",
    shortDescription: "1-to-1 virtual coaching",
    premiumRequired: 1,
    marketplaceStatus: "future_ready",
  },
  {
    id: "00000000-0000-0000-0000-000000000077",
    name: "Stress Relief",
    description: "Biofeedback-driven stress reduction techniques calibrated to your heart rate data.",
    category: "mental_health",
    shortDescription: "Biofeedback stress reduction",
    premiumRequired: 0,
    marketplaceStatus: "deferred",
  },
] as const;

const insertPartner = db.prepare(`
  INSERT OR IGNORE INTO partner_services
    (id, name, description, category, short_description, premium_required,
     marketplace_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const ps of partnerServices) {
  insertPartner.run(
    ps.id, ps.name, ps.description, ps.category,
    ps.shortDescription, ps.premiumRequired, ps.marketplaceStatus,
    now, now,
  );
}

// ---------- 12. Privacy requests ----------
db.prepare(`
  INSERT OR IGNORE INTO privacy_requests
    (id, user_id, request_type, request_status, created_at, updated_at)
  VALUES (?, ?, 'export', 'completed', ?, ?)
`).run("00000000-0000-0000-0000-000000000080", DEMO_USER_ID, now, now);

db.prepare(`
  INSERT OR IGNORE INTO privacy_requests
    (id, user_id, request_type, request_status, created_at, updated_at)
  VALUES (?, ?, 'delete', 'requested', ?, ?)
`).run("00000000-0000-0000-0000-000000000081", DEMO_USER_ID, now, now);

console.log("Seed complete.");

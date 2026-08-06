import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { InsightObject } from "./generator.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let tmpDir: string;
let db: Database.Database;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "insight-gen-test-"));
  process.env["DB_PATH"] = join(tmpDir, "test.db");

  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { getDatabase } = await import("../db/connection.js");
  db = getDatabase();
});

afterEach(async () => {
  db.close();
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["DB_PATH"];
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedUser(id: string): void {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, account_status)
     VALUES (?, ?, 'hashed', 'active')`,
  ).run(id, `${id}@test.com`);
}

function seedDevice(
  userId: string,
  deviceType: "smartwatch" | "smart_scale",
  deviceId: string,
): void {
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, device_name, provider, connection_status, connected_since)
     VALUES (?, ?, ?, 'Test', 'TestProvider', 'connected', '2099-01-01T00:00:00.000Z')`,
  ).run(deviceId, userId, deviceType);
}

function seedHealthRecord(
  userId: string,
  deviceId: string,
  metricName: string,
  value: number,
  recordedAt: string,
  domain: "vitals" | "activity" | "sleep" | "body_composition" = "activity",
  sourceType: "smartwatch" | "smart_scale" | "user_input" = "smartwatch",
): void {
  db.prepare(
    `INSERT INTO health_records
       (id, user_id, device_connection_id, metric_domain, source_type,
        metric_name, value, unit, recorded_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    deviceId,
    domain,
    sourceType,
    metricName,
    value,
    recordedAt,
    "2099-01-01T00:00:00.000Z",
    "2099-01-01T00:00:00.000Z",
  );
}

// ---------------------------------------------------------------------------
// Empty health_records
// ---------------------------------------------------------------------------

describe("generateInsights — empty health_records", () => {
  it("returns [] when no health records exist for the user", async () => {
    seedUser("user-empty");
    seedDevice("user-empty", "smartwatch", "dev-empty-sw");

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights("user-empty", db);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SleepQualityImproved
// ---------------------------------------------------------------------------

describe("generateInsights — SleepQualityImproved", () => {
  it("emits SleepQualityImproved insight when this week avg sleep > prior week avg", async () => {
    const userId = "user-sleep-up";
    const devId = "dev-sleep-up";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    // anchor: Thursday 2026-01-08, week of Mon Jan 5
    const anchor = new Date("2026-01-08T00:00:00.000Z");

    // Prior week (Mon 2025-12-29 – Sun 2026-01-04): avg 360 min
    for (let i = 0; i < 7; i++) {
      const d = new Date("2025-12-29T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userId, devId, "sleep_minutes", 360, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }

    // This week so far (Mon 2026-01-05 – Thu 2026-01-08): avg 420 min
    for (let i = 0; i < 4; i++) {
      const d = new Date("2026-01-05T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userId, devId, "sleep_minutes", 420, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    const insight = result.find((r: InsightObject) => r.category === "SleepQualityImproved");

    expect(insight).toBeDefined();
    expect(insight!.category).toBe("SleepQualityImproved");
    expect(insight!.title).toBe("Your sleep is trending better");
    expect(insight!.narrative).toBe(
      "Over the past week, your average time asleep increased and you woke up less often. Nice work — consistency tends to help.",
    );
    expect(insight!.icon).toBe("💤");
    expect(insight!.link_label).toBe("View Trends →");
  });

  it("does NOT emit SleepQualityImproved when this week avg sleep <= prior week avg", async () => {
    const userId = "user-sleep-down";
    const devId = "dev-sleep-down";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-01-08T00:00:00.000Z");

    // Prior week: avg 420
    for (let i = 0; i < 7; i++) {
      const d = new Date("2025-12-29T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userId, devId, "sleep_minutes", 420, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }

    // This week: avg 360
    for (let i = 0; i < 4; i++) {
      const d = new Date("2026-01-05T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userId, devId, "sleep_minutes", 360, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "SleepQualityImproved")).toBeUndefined();
  });

  it("does NOT emit SleepQualityImproved when prior week has no data", async () => {
    const userId = "user-sleep-noprev";
    const devId = "dev-sleep-noprev";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-01-08T00:00:00.000Z");

    // Only this week data
    for (let i = 0; i < 4; i++) {
      const d = new Date("2026-01-05T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userId, devId, "sleep_minutes", 420, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "SleepQualityImproved")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ActivityStreak
// ---------------------------------------------------------------------------

describe("generateInsights — ActivityStreak", () => {
  it("emits ActivityStreak insight when 7 consecutive days of step_count >= 10000 ending today", async () => {
    const userId = "user-streak-yes";
    const devId = "dev-streak-yes";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-02-07T00:00:00.000Z");

    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      seedHealthRecord(userId, devId, "step_count", 10500, `${dateStr}T12:00:00.000Z`);
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    const insight = result.find((r: InsightObject) => r.category === "ActivityStreak");

    expect(insight).toBeDefined();
    expect(insight!.category).toBe("ActivityStreak");
    expect(insight!.title).toBe("7 days of movement in a row");
    expect(insight!.narrative).toBe(
      "You've hit your activity goal seven days running. Streaks like this are a great way to build a habit",
    );
    expect(insight!.icon).toBe("🎯");
    expect(insight!.link_label).toBe("View Progress →");
  });

  it("does NOT emit ActivityStreak when streak is only 6 days", async () => {
    const userId = "user-streak-6";
    const devId = "dev-streak-6";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-02-07T00:00:00.000Z");

    // 6 days ending today with high steps
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      seedHealthRecord(userId, devId, "step_count", 10500, `${dateStr}T12:00:00.000Z`);
    }
    // Day 7 ago: below threshold
    const day7ago = new Date(anchor);
    day7ago.setUTCDate(day7ago.getUTCDate() - 6);
    seedHealthRecord(userId, devId, "step_count", 5000, `${day7ago.toISOString().slice(0, 10)}T12:00:00.000Z`);

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "ActivityStreak")).toBeUndefined();
  });

  it("does NOT emit ActivityStreak when step_count is below 10000 on any of the 7 days", async () => {
    const userId = "user-streak-low";
    const devId = "dev-streak-low";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-02-07T00:00:00.000Z");

    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      // Day 3 ago: only 9999 steps
      const steps = i === 3 ? 9999 : 10500;
      seedHealthRecord(userId, devId, "step_count", steps, `${dateStr}T12:00:00.000Z`);
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "ActivityStreak")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HeartRateVariability
// ---------------------------------------------------------------------------

describe("generateInsights — HeartRateVariability", () => {
  it("emits HeartRateVariability insight when a day this week falls outside rolling 4-week (avg ± 1 SD)", async () => {
    const userId = "user-hrv-outlier";
    const devId = "dev-hrv-outlier";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    // Thursday Feb 12 2026, week of Mon Feb 9
    const anchor = new Date("2026-02-12T00:00:00.000Z");

    // Build 28 days of baseline HRV before this week: values 48..52, sd ≈ 1.6
    for (let i = 27; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i - 7);
      const dateStr = d.toISOString().slice(0, 10);
      const hrv = 50 + ((i % 5) - 2); // values: 48,49,50,51,52 cycling
      seedHealthRecord(userId, devId, "hrv", hrv, `${dateStr}T08:00:00.000Z`, "vitals");
    }

    // This week: one day with HRV = 20 (far below baseline)
    seedHealthRecord(userId, devId, "hrv", 20, "2026-02-09T08:00:00.000Z", "vitals");
    seedHealthRecord(userId, devId, "hrv", 49, "2026-02-10T08:00:00.000Z", "vitals");

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    const insight = result.find((r: InsightObject) => r.category === "HeartRateVariability");

    expect(insight).toBeDefined();
    expect(insight!.category).toBe("HeartRateVariability");
    expect(insight!.title).toBe("Your HRV pattern this week");
    expect(insight!.narrative).toBe(
      "Your heart rate variability was lower than your typical range on a few days. HRV naturally fluctuates with things like sleep, stress, and activity",
    );
    expect(insight!.icon).toBe("❤️");
    expect(insight!.link_label).toBe("View Trends →");
  });

  it("does NOT emit HeartRateVariability when this week's HRV is within range", async () => {
    const userId = "user-hrv-normal";
    const devId = "dev-hrv-normal";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-02-12T00:00:00.000Z");

    // Baseline: values 48..52 for 28 days
    for (let i = 27; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i - 7);
      const dateStr = d.toISOString().slice(0, 10);
      seedHealthRecord(userId, devId, "hrv", 50 + ((i % 5) - 2), `${dateStr}T08:00:00.000Z`, "vitals");
    }

    // This week: HRV exactly in the middle of the range
    seedHealthRecord(userId, devId, "hrv", 50, "2026-02-09T08:00:00.000Z", "vitals");
    seedHealthRecord(userId, devId, "hrv", 50, "2026-02-10T08:00:00.000Z", "vitals");

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "HeartRateVariability")).toBeUndefined();
  });

  it("does NOT emit HeartRateVariability when there are no HRV records", async () => {
    const userId = "user-hrv-nodata";
    const devId = "dev-hrv-nodata";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-02-12T00:00:00.000Z");
    // Only step_count records, no HRV
    seedHealthRecord(userId, devId, "step_count", 8000, "2026-02-09T12:00:00.000Z");

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "HeartRateVariability")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BodyCompositionTrend
// ---------------------------------------------------------------------------

describe("generateInsights — BodyCompositionTrend", () => {
  it("emits BodyCompositionTrend when absolute change >= 0.5 percentage points between months", async () => {
    const userId = "user-body-change";
    const devId = "dev-body-change";
    seedUser(userId);
    seedDevice(userId, "smart_scale", devId);

    const anchor = new Date("2026-02-15T00:00:00.000Z");

    // Previous month (Jan 2026): avg 25.0%
    for (let d = 1; d <= 5; d++) {
      const dateStr = `2026-01-${String(d).padStart(2, "0")}`;
      seedHealthRecord(userId, devId, "body_fat_pct", 25.0, `${dateStr}T08:00:00.000Z`, "body_composition", "smart_scale");
    }

    // This month (Feb 2026): avg 24.0% (change = 1.0 >= 0.5)
    for (let d = 1; d <= 5; d++) {
      const dateStr = `2026-02-${String(d).padStart(2, "0")}`;
      seedHealthRecord(userId, devId, "body_fat_pct", 24.0, `${dateStr}T08:00:00.000Z`, "body_composition", "smart_scale");
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    const insight = result.find((r: InsightObject) => r.category === "BodyCompositionTrend");

    expect(insight).toBeDefined();
    expect(insight!.category).toBe("BodyCompositionTrend");
    expect(insight!.title).toBe("A shift in your body composition");
    expect(insight!.narrative).toBe(
      "Your recorded measurements show a gradual change over the last month. Trends are easier to read over weeks than day to day.",
    );
    expect(insight!.icon).toBe("⚖️");
    expect(insight!.link_label).toBe("View Progress →");
  });

  it("does NOT emit BodyCompositionTrend when change is less than 0.5 percentage points", async () => {
    const userId = "user-body-stable";
    const devId = "dev-body-stable";
    seedUser(userId);
    seedDevice(userId, "smart_scale", devId);

    const anchor = new Date("2026-02-15T00:00:00.000Z");

    // Previous month: avg 25.0%
    for (let d = 1; d <= 5; d++) {
      const dateStr = `2026-01-${String(d).padStart(2, "0")}`;
      seedHealthRecord(userId, devId, "body_fat_pct", 25.0, `${dateStr}T08:00:00.000Z`, "body_composition", "smart_scale");
    }

    // This month: avg 25.3% (change = 0.3 < 0.5)
    for (let d = 1; d <= 5; d++) {
      const dateStr = `2026-02-${String(d).padStart(2, "0")}`;
      seedHealthRecord(userId, devId, "body_fat_pct", 25.3, `${dateStr}T08:00:00.000Z`, "body_composition", "smart_scale");
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "BodyCompositionTrend")).toBeUndefined();
  });

  it("does NOT emit BodyCompositionTrend when prior month has no data", async () => {
    const userId = "user-body-noprev";
    const devId = "dev-body-noprev";
    seedUser(userId);
    seedDevice(userId, "smart_scale", devId);

    const anchor = new Date("2026-02-15T00:00:00.000Z");

    // Only this month
    for (let d = 1; d <= 5; d++) {
      const dateStr = `2026-02-${String(d).padStart(2, "0")}`;
      seedHealthRecord(userId, devId, "body_fat_pct", 24.0, `${dateStr}T08:00:00.000Z`, "body_composition", "smart_scale");
    }

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);
    expect(result.find((r: InsightObject) => r.category === "BodyCompositionTrend")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Missing data for a metric — only the relevant insight type is omitted
// ---------------------------------------------------------------------------

describe("generateInsights — missing metric does not affect other insight types", () => {
  it("omits HeartRateVariability but still returns ActivityStreak when HRV records are absent", async () => {
    const userId = "user-partial-data";
    const devId = "dev-partial-data";
    seedUser(userId);
    seedDevice(userId, "smartwatch", devId);

    const anchor = new Date("2026-02-07T00:00:00.000Z");

    // 7 consecutive days of steps — should produce ActivityStreak
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i);
      seedHealthRecord(userId, devId, "step_count", 11000, `${d.toISOString().slice(0, 10)}T12:00:00.000Z`);
    }

    // No HRV data at all

    const { generateInsights } = await import("./generator.js");
    const result = await generateInsights(userId, db, anchor);

    const streak = result.find((r: InsightObject) => r.category === "ActivityStreak");
    const hrv = result.find((r: InsightObject) => r.category === "HeartRateVariability");

    expect(streak).toBeDefined();
    expect(hrv).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-user isolation
// ---------------------------------------------------------------------------

describe("generateInsights — cross-user isolation", () => {
  it("user A rows do NOT appear in user B result, and vice versa", async () => {
    const userA = "user-iso-a";
    const userB = "user-iso-b";
    const devA = "dev-iso-a";
    const devB = "dev-iso-b";

    seedUser(userA);
    seedDevice(userA, "smartwatch", devA);
    seedUser(userB);
    seedDevice(userB, "smartwatch", devB);

    const anchor = new Date("2026-02-07T00:00:00.000Z");

    // User A: 7-day activity streak
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i);
      seedHealthRecord(userA, devA, "step_count", 12000, `${d.toISOString().slice(0, 10)}T12:00:00.000Z`);
    }

    // User B: one record well below threshold
    seedHealthRecord(userB, devB, "step_count", 1000, `${anchor.toISOString().slice(0, 10)}T12:00:00.000Z`);

    const { generateInsights } = await import("./generator.js");
    const resultA = await generateInsights(userA, db, anchor);
    const resultB = await generateInsights(userB, db, anchor);

    expect(resultA.find((r: InsightObject) => r.category === "ActivityStreak")).toBeDefined();
    expect(resultB.find((r: InsightObject) => r.category === "ActivityStreak")).toBeUndefined();
  });

  it("querying user B does not surface health_records belonging to user A", async () => {
    const userA = "user-leak-a";
    const userB = "user-leak-b";
    const devA = "dev-leak-a";
    const devB = "dev-leak-b";

    seedUser(userA);
    seedDevice(userA, "smart_scale", devA);
    seedUser(userB);
    seedDevice(userB, "smart_scale", devB);

    const anchor = new Date("2026-02-15T00:00:00.000Z");

    // User A has body composition data that would emit BodyCompositionTrend
    for (let d = 1; d <= 5; d++) {
      const jan = `2026-01-${String(d).padStart(2, "0")}`;
      const feb = `2026-02-${String(d).padStart(2, "0")}`;
      seedHealthRecord(userA, devA, "body_fat_pct", 25.0, `${jan}T08:00:00.000Z`, "body_composition", "smart_scale");
      seedHealthRecord(userA, devA, "body_fat_pct", 24.0, `${feb}T08:00:00.000Z`, "body_composition", "smart_scale");
    }

    // User B has no body composition data
    const { generateInsights } = await import("./generator.js");
    const resultB = await generateInsights(userB, db, anchor);

    expect(resultB.find((r: InsightObject) => r.category === "BodyCompositionTrend")).toBeUndefined();
    expect(resultB).toEqual([]);
  });

  it("seeding sleep/HRV data for user A does not cause any insight for user B", async () => {
    // anchor: Thursday 2026-01-08, week Mon 2026-01-05
    const anchor = new Date("2026-01-08T00:00:00.000Z");

    const userA = "user-sleep-hrv-a";
    const userB = "user-sleep-hrv-b";
    const devA = "dev-sleep-hrv-a";
    const devB = "dev-sleep-hrv-b";

    seedUser(userA);
    seedDevice(userA, "smartwatch", devA);
    seedUser(userB);
    seedDevice(userB, "smartwatch", devB);

    // User A: sleep data that would emit SleepQualityImproved
    // Prior week (Mon 2025-12-29 – Sun 2026-01-04): avg 360 min
    for (let i = 0; i < 7; i++) {
      const d = new Date("2025-12-29T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userA, devA, "sleep_minutes", 360, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }
    // This week (Mon 2026-01-05 – Thu 2026-01-08): avg 420 min
    for (let i = 0; i < 4; i++) {
      const d = new Date("2026-01-05T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + i);
      seedHealthRecord(userA, devA, "sleep_minutes", 420, `${d.toISOString().slice(0, 10)}T06:00:00.000Z`, "sleep");
    }

    // User A: HRV data that would emit HeartRateVariability
    // 28 days of baseline before this week (Mon 2026-01-05)
    for (let i = 27; i >= 0; i--) {
      const d = new Date("2025-12-29T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() - i);
      seedHealthRecord(userA, devA, "hrv", 50 + ((i % 5) - 2), `${d.toISOString().slice(0, 10)}T08:00:00.000Z`, "vitals");
    }
    // This week: outlier HRV for user A
    seedHealthRecord(userA, devA, "hrv", 5, "2026-01-05T08:00:00.000Z", "vitals");

    // User B has no health records
    const { generateInsights } = await import("./generator.js");
    const resultB = await generateInsights(userB, db, anchor);

    expect(resultB.find((r: InsightObject) => r.category === "SleepQualityImproved")).toBeUndefined();
    expect(resultB.find((r: InsightObject) => r.category === "HeartRateVariability")).toBeUndefined();
    expect(resultB).toEqual([]);
  });
});

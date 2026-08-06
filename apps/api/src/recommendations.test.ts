import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { RecommendationService } from "./recommendations.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "db/migrations",
);

let tmpDir: string;
let db: Database.Database;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "recs-test-"));
  process.env["DB_PATH"] = join(tmpDir, "test.db");

  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();

  const { migrate } = await import("./db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { getDatabase } = await import("./db/connection.js");
  db = getDatabase();
});

afterEach(async () => {
  db.close();
  const { resetDatabase } = await import("./db/connection.js");
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

function seedDevice(userId: string, deviceId: string): void {
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, device_name, provider, connection_status, connected_since)
     VALUES (?, ?, 'smartwatch', 'Test', 'TestProvider', 'connected', '2099-01-01T00:00:00.000Z')`,
  ).run(deviceId, userId);
}

function seedHealthRecord(userId: string, deviceId: string): void {
  db.prepare(
    `INSERT INTO health_records
       (id, user_id, device_connection_id, metric_domain, source_type,
        metric_name, value, unit, recorded_at, created_at, updated_at)
     VALUES (?, ?, ?, 'activity', 'smartwatch', 'step_count', 8000, NULL,
             '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')`,
  ).run(randomUUID(), userId, deviceId);
}

// ---------------------------------------------------------------------------
// generate — fewer than MIN health records
// ---------------------------------------------------------------------------

describe("RecommendationService.generate — insufficient health records", () => {
  it("returns [] when user has 0 health records", () => {
    seedUser("user-zero");
    seedDevice("user-zero", "dev-zero");

    const svc = new RecommendationService(db);
    const result = svc.generate("user-zero");

    expect(result).toEqual([]);
  });

  it("returns [] when user has exactly 1 health record", () => {
    const userId = "user-one";
    seedUser(userId);
    seedDevice(userId, "dev-one");
    seedHealthRecord(userId, "dev-one");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    expect(result).toEqual([]);
  });

  it("returns [] when user has exactly 2 health records", () => {
    const userId = "user-two";
    seedUser(userId);
    seedDevice(userId, "dev-two");
    seedHealthRecord(userId, "dev-two");
    seedHealthRecord(userId, "dev-two");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generate — sufficient health records
// ---------------------------------------------------------------------------

describe("RecommendationService.generate — sufficient health records (>= 3)", () => {
  it("returns exactly 3 rows when user has 3 health records", () => {
    const userId = "user-three";
    seedUser(userId);
    seedDevice(userId, "dev-three");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-three");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    expect(result.length).toBe(3);
  });

  it("every row has insight_type in ('recommendation','nudge')", () => {
    const userId = "user-type";
    seedUser(userId);
    seedDevice(userId, "dev-type");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-type");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(["recommendation", "nudge"]).toContain(row.insight_type);
    }
  });

  it("every row has insight_type 'nudge'", () => {
    const userId = "user-nudge";
    seedUser(userId);
    seedDevice(userId, "dev-nudge");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-nudge");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(row.insight_type).toBe("nudge");
    }
  });

  it("every row has user_data_only = 1", () => {
    const userId = "user-udonly";
    seedUser(userId);
    seedDevice(userId, "dev-udonly");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-udonly");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(row.user_data_only).toBe(1);
    }
  });

  it("generator_name is never 'ai_wellness_coach' (never equals that value)", () => {
    const userId = "user-genname";
    seedUser(userId);
    seedDevice(userId, "dev-genname");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-genname");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(row.generator_name).not.toBe("ai_wellness_coach");
      expect(row.generator_name).not.toBe("AI Wellness Coach");
    }
  });

  it("generator_name is NULL on every row", () => {
    const userId = "user-null-gen";
    seedUser(userId);
    seedDevice(userId, "dev-null-gen");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-null-gen");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(row.generator_name).toBeNull();
    }
  });

  it("every row belongs to the requesting user", () => {
    const userId = "user-own";
    seedUser(userId);
    seedDevice(userId, "dev-own");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-own");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(row.user_id).toBe(userId);
    }
  });

  it("every row has status 'active'", () => {
    const userId = "user-status";
    seedUser(userId);
    seedDevice(userId, "dev-status");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-status");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    for (const row of result) {
      expect(row.status).toBe("active");
    }
  });

  it("stores the exact copy text for the post-lunch walk nudge", () => {
    const userId = "user-copy";
    seedUser(userId);
    seedDevice(userId, "dev-copy");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-copy");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    const walk = result.find((r) =>
      r.content.includes("10-minute walk after lunch"),
    );
    expect(walk).toBeDefined();
    expect(walk!.content).toBe(
      "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    );
  });

  it("stores the exact copy text for the bedtime alarm nudge", () => {
    const userId = "user-copy2";
    seedUser(userId);
    seedDevice(userId, "dev-copy2");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-copy2");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    const bedtime = result.find((r) => r.content.includes("bedtime alarm"));
    expect(bedtime).toBeDefined();
    expect(bedtime!.content).toBe(
      "Consider setting a consistent bedtime alarm for 10:30 PM to maintain your improved sleep schedule.",
    );
  });

  it("stores the exact copy text for the hydration nudge", () => {
    const userId = "user-copy3";
    seedUser(userId);
    seedDevice(userId, "dev-copy3");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-copy3");

    const svc = new RecommendationService(db);
    const result = svc.generate(userId);

    const hydration = result.find((r) => r.content.includes("hydrated"));
    expect(hydration).toBeDefined();
    expect(hydration!.content).toBe(
      "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
    );
  });

  it("calling generate twice does not duplicate rows (idempotent upsert)", () => {
    const userId = "user-idem";
    seedUser(userId);
    seedDevice(userId, "dev-idem");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-idem");

    const svc = new RecommendationService(db);
    svc.generate(userId);
    const second = svc.generate(userId);

    expect(second.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Cross-user isolation
// ---------------------------------------------------------------------------

describe("RecommendationService.generate — cross-user isolation", () => {
  it("user B's health records do not trigger recommendations for user A", () => {
    const userA = "user-iso-a";
    const userB = "user-iso-b";
    seedUser(userA);
    seedDevice(userA, "dev-iso-a");
    seedUser(userB);
    seedDevice(userB, "dev-iso-b");

    // Only user B has health records
    for (let i = 0; i < 5; i++) seedHealthRecord(userB, "dev-iso-b");

    const svc = new RecommendationService(db);
    const resultA = svc.generate(userA);
    expect(resultA).toEqual([]);
  });

  it("recommendations for user A are not returned for user B", () => {
    const userA = "user-iso-c";
    const userB = "user-iso-d";
    seedUser(userA);
    seedDevice(userA, "dev-iso-c");
    seedUser(userB);
    seedDevice(userB, "dev-iso-d");

    for (let i = 0; i < 3; i++) seedHealthRecord(userA, "dev-iso-c");

    const svc = new RecommendationService(db);
    svc.generate(userA);

    const resultB = svc.generate(userB);
    expect(resultB).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setStatus
// ---------------------------------------------------------------------------

describe("RecommendationService.setStatus", () => {
  it("updates the status of an owned insight to 'dismissed'", () => {
    const userId = "user-ss";
    seedUser(userId);
    seedDevice(userId, "dev-ss");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-ss");

    const svc = new RecommendationService(db);
    const rows = svc.generate(userId);
    const id = rows[0]!.id;

    const updated = svc.setStatus(id, userId, "dismissed");
    expect(updated.id).toBe(id);
    expect(updated.status).toBe("dismissed");
  });

  it("throws NOT_FOUND when the id belongs to a different user", () => {
    const userA = "user-ss-a";
    const userB = "user-ss-b";
    seedUser(userA);
    seedDevice(userA, "dev-ss-a");
    seedUser(userB);
    seedDevice(userB, "dev-ss-b");
    for (let i = 0; i < 3; i++) seedHealthRecord(userA, "dev-ss-a");

    const svc = new RecommendationService(db);
    const rows = svc.generate(userA);
    const id = rows[0]!.id;

    expect(() => svc.setStatus(id, userB, "dismissed")).toThrow();
  });

  it("throws NOT_FOUND when the id does not exist", () => {
    const userId = "user-ss-missing";
    seedUser(userId);

    const svc = new RecommendationService(db);
    expect(() => svc.setStatus("nonexistent-id", userId, "done")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getActive
// ---------------------------------------------------------------------------

describe("RecommendationService.getActive", () => {
  it("returns only active rows for the user", () => {
    const userId = "user-active";
    seedUser(userId);
    seedDevice(userId, "dev-active");
    for (let i = 0; i < 3; i++) seedHealthRecord(userId, "dev-active");

    const svc = new RecommendationService(db);
    svc.generate(userId);
    const rows = svc.getActive(userId);
    const id = rows[0]!.id;

    svc.setStatus(id, userId, "dismissed");

    const activeAfter = svc.getActive(userId);
    expect(activeAfter.length).toBe(2);
    expect(activeAfter.every((r) => r.status === "active")).toBe(true);
  });

  it("returns [] when no active rows exist", () => {
    const userId = "user-noactive";
    seedUser(userId);
    seedDevice(userId, "dev-noactive");

    const svc = new RecommendationService(db);
    expect(svc.getActive(userId)).toEqual([]);
  });
});

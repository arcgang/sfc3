import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);
const TEST_JWT_SECRET = "test-jwt-secret-dashboard";

// Far-future constant for fixture timestamps — avoids absolute wall-clock dates.
const FIXTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";
// A timestamp recent enough (1 hour ago relative to FIXTURE_TIMESTAMP) to be non-stale.
// Since tests don't run in 2099, we use a recent real time offset for stale calculations.
const RECENT_SYNC_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
const STALE_SYNC_AT = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "dashboard-test-"));
  }

  get tmpDir(): string {
    return this._tmpDir;
  }

  cleanup(): void {
    rmSync(this._tmpDir, { recursive: true, force: true });
  }
}

let ctx: TestContext;

beforeEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx = new TestContext();
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { dashboardRouter } = await import("./dashboardRoutes.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/dashboard", authMiddleware(TEST_JWT_SECRET), dashboardRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId, email: `${userId}@example.com` }, TEST_JWT_SECRET, {
    expiresIn: "1h",
  });
}

function seedUser(db: Database.Database, userId: string): void {
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
}

function seedDevice(
  db: Database.Database,
  userId: string,
  deviceType: "smartwatch" | "smart_scale",
  connId: string,
  lastSuccessfulSyncAt: string | null = null,
): void {
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, device_name, provider, connection_status,
        last_successful_sync_at, connected_since, created_at, updated_at)
     VALUES (?, ?, ?, 'Test Device', 'TestProvider', 'connected', ?, ?, ?, ?)`,
  ).run(connId, userId, deviceType, lastSuccessfulSyncAt, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
}

function seedHealthRecord(
  db: Database.Database,
  userId: string,
  connId: string,
  sourceType: "smartwatch" | "smart_scale",
  metricName: string,
  value: number,
  recordedAt: string = FIXTURE_TIMESTAMP,
): void {
  const { randomUUID } = require("node:crypto");
  const metricDomain = sourceType === "smartwatch" ? "activity" : "body_composition";
  db.prepare(
    `INSERT INTO health_records
       (id, user_id, device_connection_id, metric_domain, source_type,
        metric_name, value, unit, recorded_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    connId,
    metricDomain,
    sourceType,
    metricName,
    value,
    recordedAt,
    FIXTURE_TIMESTAMP,
    FIXTURE_TIMESTAMP,
  );
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/dashboard");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — no devices connected", () => {
  it("returns 200 with empty devices array and null metrics when user has no devices", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-empty-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: unknown[]; smartwatch: unknown; smartScale: unknown } };
    expect(body.data.devices).toEqual([]);
    expect(body.data.smartwatch).toBeNull();
    expect(body.data.smartScale).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Smartwatch-only
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — smartwatch only", () => {
  it("returns smartwatch metrics and null smartScale when only smartwatch is connected with records", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-sw-only-1";
    const connId = "conn-sw-only-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    seedHealthRecord(db, userId, connId, "smartwatch", "steps", 8000);
    seedHealthRecord(db, userId, connId, "smartwatch", "heart_rate", 72);
    seedHealthRecord(db, userId, connId, "smartwatch", "sleep_minutes", 420);
    seedHealthRecord(db, userId, connId, "smartwatch", "active_minutes", 45);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        smartwatch: { steps: number; heartRate: number; sleepMinutes: number; activeMinutes: number };
        smartScale: null;
      };
    };
    expect(body.data.smartwatch.steps).toBe(8000);
    expect(body.data.smartwatch.heartRate).toBe(72);
    expect(body.data.smartwatch.sleepMinutes).toBe(420);
    expect(body.data.smartwatch.activeMinutes).toBe(45);
    expect(body.data.smartScale).toBeNull();
  });

  it("returns null smartwatch when no health_records exist for the connected smartwatch", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-sw-only-2";
    const connId = "conn-sw-only-2";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, null);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { smartwatch: null; smartScale: null } };
    expect(body.data.smartwatch).toBeNull();
    expect(body.data.smartScale).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Both device types
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — both smartwatch and smart_scale connected", () => {
  it("returns metrics from both device types in a single payload", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-both-1";
    const swConnId = "conn-both-sw-1";
    const ssConnId = "conn-both-ss-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", swConnId, RECENT_SYNC_AT);
    seedDevice(db, userId, "smart_scale", ssConnId, RECENT_SYNC_AT);
    seedHealthRecord(db, userId, swConnId, "smartwatch", "steps", 10000);
    seedHealthRecord(db, userId, swConnId, "smartwatch", "heart_rate", 65);
    seedHealthRecord(db, userId, swConnId, "smartwatch", "sleep_minutes", 480);
    seedHealthRecord(db, userId, swConnId, "smartwatch", "active_minutes", 60);
    seedHealthRecord(db, userId, ssConnId, "smart_scale", "weight_kg", 75.5);
    seedHealthRecord(db, userId, ssConnId, "smart_scale", "body_fat_pct", 18.0);
    seedHealthRecord(db, userId, ssConnId, "smart_scale", "muscle_mass_pct", 42.5);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        devices: Array<{ deviceType: string; connectionStatus: string; lastSuccessfulSyncAt: string | null; stale: boolean }>;
        smartwatch: { steps: number; heartRate: number; sleepMinutes: number; activeMinutes: number };
        smartScale: { weightKg: number; bodyFatPct: number; muscleMassPct: number };
      };
    };

    expect(body.data.devices.length).toBe(2);

    expect(body.data.smartwatch.steps).toBe(10000);
    expect(body.data.smartwatch.heartRate).toBe(65);
    expect(body.data.smartwatch.sleepMinutes).toBe(480);
    expect(body.data.smartwatch.activeMinutes).toBe(60);

    expect(body.data.smartScale.weightKg).toBe(75.5);
    expect(body.data.smartScale.bodyFatPct).toBe(18.0);
    expect(body.data.smartScale.muscleMassPct).toBe(42.5);
  });

  it("includes both device types in the devices array with correct deviceType fields", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-both-2";
    const swConnId = "conn-both-sw-2";
    const ssConnId = "conn-both-ss-2";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", swConnId, RECENT_SYNC_AT);
    seedDevice(db, userId, "smart_scale", ssConnId, RECENT_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: Array<{ deviceType: string }> } };
    const types = body.data.devices.map((d) => d.deviceType).sort();
    expect(types).toEqual(["smart_scale", "smartwatch"]);
  });
});

// ---------------------------------------------------------------------------
// Scale absent — graceful omission
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — smart_scale connected but no records", () => {
  it("returns null smartScale gracefully when scale has no health_records", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-scale-absent-1";
    const swConnId = "conn-sa-sw-1";
    const ssConnId = "conn-sa-ss-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", swConnId, RECENT_SYNC_AT);
    seedDevice(db, userId, "smart_scale", ssConnId, null);
    seedHealthRecord(db, userId, swConnId, "smartwatch", "steps", 5000);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { smartwatch: { steps: number } | null; smartScale: null } };
    expect(body.data.smartwatch).not.toBeNull();
    expect(body.data.smartwatch?.steps).toBe(5000);
    expect(body.data.smartScale).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stale data flag
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — stale flag", () => {
  it("marks device as stale when last_successful_sync_at is null", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-stale-1";
    const connId = "conn-stale-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, null);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: Array<{ stale: boolean }> } };
    expect(body.data.devices[0]?.stale).toBe(true);
  });

  it("marks device as stale when last_successful_sync_at is more than 18 hours ago", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-stale-2";
    const connId = "conn-stale-2";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, STALE_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: Array<{ stale: boolean }> } };
    expect(body.data.devices[0]?.stale).toBe(true);
  });

  it("marks device as not stale when last_successful_sync_at is within 18 hours", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-stale-3";
    const connId = "conn-stale-3";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: Array<{ stale: boolean; lastSuccessfulSyncAt: string }> } };
    expect(body.data.devices[0]?.stale).toBe(false);
    expect(body.data.devices[0]?.lastSuccessfulSyncAt).toBe(RECENT_SYNC_AT);
  });
});

// ---------------------------------------------------------------------------
// lastSyncStatus contract fields
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — lastSyncStatus LLD contract fields", () => {
  it("lastSyncStatus includes isStale, staleThresholdHours, overallLastSyncAt, and deviceStatuses", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-lss-shape-1";
    const connId = "conn-lss-shape-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        lastSyncStatus: {
          isStale: boolean;
          staleThresholdHours: number;
          overallLastSyncAt: string | null;
          deviceStatuses: Array<{ deviceType: string; status: string; lastSyncAt: string | null; stale: boolean }>;
        };
      };
    };
    expect(typeof body.data.lastSyncStatus.isStale).toBe("boolean");
    expect(typeof body.data.lastSyncStatus.staleThresholdHours).toBe("number");
    expect(body.data.lastSyncStatus.staleThresholdHours).toBe(18);
    expect(body.data.lastSyncStatus.overallLastSyncAt).toBe(RECENT_SYNC_AT);
    expect(Array.isArray(body.data.lastSyncStatus.deviceStatuses)).toBe(true);
  });

  it("lastSyncStatus.isStale is false when all devices synced recently", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-lss-fresh-1";
    const connId = "conn-lss-fresh-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { lastSyncStatus: { isStale: boolean } } };
    expect(body.data.lastSyncStatus.isStale).toBe(false);
  });

  it("lastSyncStatus.isStale is true when any device has stale data", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-lss-stale-1";
    const connId = "conn-lss-stale-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, STALE_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { lastSyncStatus: { isStale: boolean } } };
    expect(body.data.lastSyncStatus.isStale).toBe(true);
  });

  it("per-device entry in deviceStatuses has status field (not connectionStatus)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-lss-field-1";
    const connId = "conn-lss-field-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        lastSyncStatus: {
          deviceStatuses: Array<Record<string, unknown>>;
        };
      };
    };
    const entry = body.data.lastSyncStatus.deviceStatuses[0];
    expect(entry).toBeDefined();
    expect("status" in (entry ?? {})).toBe(true);
    expect("connectionStatus" in (entry ?? {})).toBe(false);
    expect(entry?.["status"]).toBe("connected");
  });

  it("overallLastSyncAt reflects the most recent device sync when multiple devices present", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-lss-multi-1";
    const swConnId = "conn-lss-sw-1";
    const ssConnId = "conn-lss-ss-1";
    const olderSync = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", swConnId, RECENT_SYNC_AT);
    seedDevice(db, userId, "smart_scale", ssConnId, olderSync);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { lastSyncStatus: { overallLastSyncAt: string } } };
    // RECENT_SYNC_AT is 1h ago, olderSync is 2h ago — most recent wins
    expect(body.data.lastSyncStatus.overallLastSyncAt).toBe(RECENT_SYNC_AT);
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — response envelope", () => {
  it("includes meta.correlationId and meta.timestamp in the response", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-meta-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { meta: { correlationId: string; timestamp: string } };
    expect(typeof body.meta.correlationId).toBe("string");
    expect(typeof body.meta.timestamp).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — trends", () => {
  it("returns trends.steps7d and trends.heartRateToday as empty arrays when no health records exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-empty-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        trends: {
          steps7d: unknown[];
          heartRateToday: unknown[];
          stepsGoal: null;
        };
      };
    };
    expect(body.data.trends.steps7d).toEqual([]);
    expect(body.data.trends.heartRateToday).toEqual([]);
    expect(body.data.trends.stepsGoal).toBeNull();
  });

  it("returns steps7d aggregated by calendar day with the supplied step_count value", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-steps-1";
    const connId = "conn-trends-sw-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);

    // Two different days within the last 7 days
    const day1 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day2 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedHealthRecord(db, userId, connId, "smartwatch", "step_count", 5000, `${day1}T10:00:00.000Z`);
    seedHealthRecord(db, userId, connId, "smartwatch", "step_count", 8000, `${day1}T18:00:00.000Z`);
    seedHealthRecord(db, userId, connId, "smartwatch", "step_count", 9500, `${day2}T18:00:00.000Z`);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { trends: { steps7d: Array<{ date: string; stepCount: number }> } };
    };
    const days = body.data.trends.steps7d;
    const d1 = days.find((d) => d.date === day1);
    const d2 = days.find((d) => d.date === day2);

    // day1 should aggregate to 8000 (MAX of 5000 and 8000)
    expect(d1?.stepCount).toBe(8000);
    // day2 should be 9500
    expect(d2?.stepCount).toBe(9500);
  });

  it("returns heartRateToday with bpm values from today's heart_rate_bpm records", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-hr-1";
    const connId = "conn-trends-hr-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);

    const todayMorning = new Date();
    todayMorning.setUTCHours(8, 0, 0, 0);
    const todayNoon = new Date();
    todayNoon.setUTCHours(12, 0, 0, 0);

    seedHealthRecord(db, userId, connId, "smartwatch", "heart_rate_bpm", 68, todayMorning.toISOString());
    seedHealthRecord(db, userId, connId, "smartwatch", "heart_rate_bpm", 85, todayNoon.toISOString());
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { trends: { heartRateToday: Array<{ recordedAt: string; bpm: number }> } };
    };
    expect(body.data.trends.heartRateToday.length).toBe(2);
    expect(body.data.trends.heartRateToday[0]!.bpm).toBe(68);
    expect(body.data.trends.heartRateToday[1]!.bpm).toBe(85);
  });

  it("excludes heart_rate_bpm records from previous days in heartRateToday", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-hr-2";
    const connId = "conn-trends-hr-2";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedHealthRecord(db, userId, connId, "smartwatch", "heart_rate_bpm", 70, `${yesterday}T10:00:00.000Z`);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { trends: { heartRateToday: unknown[] } };
    };
    // Yesterday's record must not appear in today's heart rate
    expect(body.data.trends.heartRateToday).toEqual([]);
  });

  it("returns stepsGoal from active steps_daily goal", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-goal-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    const { randomUUID } = require("node:crypto");
    db.prepare(
      `INSERT INTO goals (id, user_id, goal_type, cadence, status, target_value, target_unit, start_date)
       VALUES (?, ?, 'steps_daily', 'daily', 'active', ?, 'steps', '2026-01-01')`,
    ).run(randomUUID(), userId, 10000);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { trends: { stepsGoal: number } } };
    expect(body.data.trends.stepsGoal).toBe(10000);
  });

  it("returns trends.sleepMinutes7d and trends.weight7d as empty arrays when no health records exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-empty-sleep-weight-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        trends: {
          sleepMinutes7d: unknown[];
          weight7d: unknown[];
        };
      };
    };
    expect(body.data.trends.sleepMinutes7d).toEqual([]);
    expect(body.data.trends.weight7d).toEqual([]);
  });

  it("returns sleepMinutes7d with summed sleep_minutes per calendar day", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-sleep-1";
    const connId = "conn-trends-sleep-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);

    const day1 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day2 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedHealthRecord(db, userId, connId, "smartwatch", "sleep_minutes", 420, `${day1}T06:00:00.000Z`);
    seedHealthRecord(db, userId, connId, "smartwatch", "sleep_minutes", 30, `${day1}T14:00:00.000Z`);
    seedHealthRecord(db, userId, connId, "smartwatch", "sleep_minutes", 480, `${day2}T06:00:00.000Z`);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { trends: { sleepMinutes7d: Array<{ date: string; minutes: number }> } };
    };
    const days = body.data.trends.sleepMinutes7d;
    const d1 = days.find((d) => d.date === day1);
    const d2 = days.find((d) => d.date === day2);

    // day1 sums 420 + 30 = 450
    expect(d1?.minutes).toBe(450);
    // day2 is 480
    expect(d2?.minutes).toBe(480);
  });

  it("returns weight7d with averaged weight_kg per calendar day from smart_scale", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-trends-weight-1";
    const connId = "conn-trends-weight-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smart_scale", connId, RECENT_SYNC_AT);

    const day1 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day2 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedHealthRecord(db, userId, connId, "smart_scale", "weight_kg", 68.4, `${day1}T08:00:00.000Z`);
    seedHealthRecord(db, userId, connId, "smart_scale", "weight_kg", 68.2, `${day2}T08:00:00.000Z`);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { trends: { weight7d: Array<{ date: string; kg: number }> } };
    };
    const days = body.data.trends.weight7d;
    const d1 = days.find((d) => d.date === day1);
    const d2 = days.find((d) => d.date === day2);

    expect(d1?.kg).toBe(68.4);
    expect(d2?.kg).toBe(68.2);
  });
});

// ---------------------------------------------------------------------------
// Insights — starter state and data isolation
// ---------------------------------------------------------------------------

describe("GET /api/v1/dashboard — insights starter state", () => {
  it("returns insights: [] and insights_starter_state: true when user has 0 health_records rows", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-insights-zero-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data["insights"]).toEqual([]);
    expect(body.data["insights_starter_state"]).toBe(true);
  });

  it("returns insights: [] and insights_starter_state: true when user has exactly 1 health_records row", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-insights-one-1";
    const connId = "conn-insights-one-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    seedHealthRecord(db, userId, connId, "smartwatch", "step_count", 5000);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data["insights"]).toEqual([]);
    expect(body.data["insights_starter_state"]).toBe(true);
  });

  it("returns insights array (no insights_starter_state key) when user has 2 or more health_records rows", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-insights-two-1";
    const connId = "conn-insights-two-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    seedDevice(db, userId, "smartwatch", connId, RECENT_SYNC_AT);
    seedHealthRecord(db, userId, connId, "smartwatch", "step_count", 5000);
    seedHealthRecord(db, userId, connId, "smartwatch", "step_count", 6000);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(Array.isArray(body.data["insights"])).toBe(true);
    expect("insights_starter_state" in body.data).toBe(false);
  });

  it("user A's JWT does not return user B's insights (per-user isolation)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userA = "dash-insights-iso-a";
    const userB = "dash-insights-iso-b";
    const connA = "conn-insights-iso-a";
    const connB = "conn-insights-iso-b";
    const db = new Database(dbPath);
    seedUser(db, userA);
    seedUser(db, userB);
    // userA has 0 records → starter state
    // userB has 2 records → no starter state
    seedDevice(db, userB, "smartwatch", connB, RECENT_SYNC_AT);
    seedHealthRecord(db, userB, connB, "smartwatch", "step_count", 8000);
    seedHealthRecord(db, userB, connB, "smartwatch", "step_count", 9000);
    seedDevice(db, userA, "smartwatch", connA, RECENT_SYNC_AT);
    db.close();

    const tokenA = makeToken(userA);
    const tokenB = makeToken(userB);

    const [resA, resB] = await Promise.all([
      supertest(app).get("/api/v1/dashboard").set("Authorization", `Bearer ${tokenA}`),
      supertest(app).get("/api/v1/dashboard").set("Authorization", `Bearer ${tokenB}`),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const bodyA = resA.body as { data: Record<string, unknown> };
    const bodyB = resB.body as { data: Record<string, unknown> };

    // userA sees starter state; userB does not
    expect(bodyA.data["insights_starter_state"]).toBe(true);
    expect("insights_starter_state" in bodyB.data).toBe(false);
    expect(bodyA.data["insights"]).toEqual([]);
    expect(Array.isArray(bodyB.data["insights"])).toBe(true);
  });

  it("returns 200 with insights: [] rather than an error when no insights data exists", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "dash-insights-never-error-1";
    const db = new Database(dbPath);
    seedUser(db, userId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data["insights"]).toEqual([]);
  });
});

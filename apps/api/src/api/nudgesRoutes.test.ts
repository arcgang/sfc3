import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);
const TEST_JWT_SECRET = "test-jwt-secret-nudges";

// Far-future constant for fixture timestamps — avoids absolute wall-clock dates.
const FIXTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "nudges-routes-test-"));
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
  vi.resetModules();
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env["DB_PATH"];
  delete process.env["JWT_SECRET"];
});

async function buildApp(): Promise<express.Express> {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env["DB_PATH"] = dbPath;
  process.env["JWT_SECRET"] = TEST_JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { recommendationsRouter } = await import("./recommendationsRoutes.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/recommendations", authMiddleware(TEST_JWT_SECRET), recommendationsRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

function seedUser(dbPath: string, id: string): void {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, account_status)
     VALUES (?, ?, 'hashed', 'active')`,
  ).run(id, `${id}@test.com`);
  db.close();
}

function seedDevice(dbPath: string, userId: string, deviceId: string): void {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, device_name, provider, connection_status, connected_since)
     VALUES (?, ?, 'smartwatch', 'Test', 'TestProvider', 'connected', ?)`,
  ).run(deviceId, userId, FIXTURE_TIMESTAMP);
  db.close();
}

function seedHealthRecord(dbPath: string, userId: string, deviceId: string): void {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO health_records
       (id, user_id, device_connection_id, metric_domain, source_type,
        metric_name, value, unit, recorded_at, created_at, updated_at)
     VALUES (?, ?, ?, 'activity', 'smartwatch', 'step_count', 8000, NULL, ?, ?, ?)`,
  ).run(randomUUID(), userId, deviceId, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
  db.close();
}

function seedNudge(dbPath: string, userId: string, content: string): string {
  const id = randomUUID();
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO insights
       (id, user_id, insight_type, generator_name, content, user_data_only, status, created_at, updated_at)
     VALUES (?, ?, 'nudge', NULL, ?, 1, 'active', ?, ?)`,
  ).run(id, userId, content, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
  db.close();
  return id;
}

function setNudgeStatus(dbPath: string, nudgeId: string, status: string): void {
  const db = new Database(dbPath);
  db.prepare("UPDATE insights SET status = ? WHERE id = ?").run(status, nudgeId);
  db.close();
}

function queryEngagementEvents(
  dbPath: string,
  userId: string,
): Record<string, unknown>[] {
  const db = new Database(dbPath);
  const rows = db
    .prepare(
      "SELECT * FROM engagement_events WHERE user_id = ? AND event_type = 'nudge_dismiss'",
    )
    .all(userId) as Record<string, unknown>[];
  db.close();
  return rows;
}

function queryHealthRecordCount(dbPath: string, userId: string): number {
  const db = new Database(dbPath);
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM health_records WHERE user_id = ?")
    .get(userId) as { c: number };
  db.close();
  return row.c;
}

// ---------------------------------------------------------------------------
// GET /api/v1/recommendations/nudges
// ---------------------------------------------------------------------------

describe("GET /api/v1/recommendations/nudges", () => {
  it("returns 401 when no token is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/recommendations/nudges");
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty array when user has no nudges", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);

    const res = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns only active nudges for the authenticated user", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Walk more today.");

    const res = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(nudgeId);
    expect(res.body.data[0].content).toBe("Walk more today.");
    expect(res.body.data[0].status).toBe("active");
  });

  it("returns at most 3 nudges even when more than 3 exist", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    for (let i = 0; i < 5; i++) {
      seedNudge(dbPath, userId, `Nudge content ${i}`);
    }

    const res = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });

  it("does not return nudges belonging to another user", async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userA);
    seedUser(dbPath, userB);
    seedNudge(dbPath, userB, "This belongs to user B.");

    const res = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userA)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("does not return dismissed nudges", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Should be dismissed.");
    setNudgeStatus(dbPath, nudgeId, "dismissed");

    const res = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("response meta includes correlationId as a string and timestamp as a string", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);

    const res = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.meta.correlationId).toBe("string");
    expect(typeof res.body.meta.timestamp).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/recommendations/nudges/:id/dismiss
// ---------------------------------------------------------------------------

describe("POST /api/v1/recommendations/nudges/:id/dismiss", () => {
  it("returns 401 when no token is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).post(
      "/api/v1/recommendations/nudges/some-id/dismiss",
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when nudge does not exist", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);

    const res = await supertest(app)
      .post(`/api/v1/recommendations/nudges/${randomUUID()}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 when nudge belongs to another user", async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userA);
    seedUser(dbPath, userB);
    const nudgeId = seedNudge(dbPath, userB, "Belongs to B.");

    const res = await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userA)}`);

    expect(res.status).toBe(404);
  });

  it("returns 200 and data.status is 'dismissed'", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Dismiss me.");

    const res = await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(nudgeId);
    expect(res.body.data.status).toBe("dismissed");
  });

  it("inserts an engagement_events row with event_type='nudge_dismiss'", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Track my dismissal.");

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const rows = queryEngagementEvents(dbPath, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!["event_type"]).toBe("nudge_dismiss");
    expect(rows[0]!["user_id"]).toBe(userId);
  });

  it("engagement_events row event_context_json contains nudge_id equal to the dismissed nudge's id", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Context check nudge.");

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const rows = queryEngagementEvents(dbPath, userId);
    expect(rows).toHaveLength(1);
    const parsed = JSON.parse(rows[0]!["event_context_json"] as string);
    expect(parsed.nudge_id).toBe(nudgeId);
  });

  it("does not modify health_record rows when dismissing a nudge", async () => {
    const userId = randomUUID();
    const deviceId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    seedDevice(dbPath, userId, deviceId);
    seedHealthRecord(dbPath, userId, deviceId);
    const nudgeId = seedNudge(dbPath, userId, "Verify no side effects.");

    const countBefore = queryHealthRecordCount(dbPath, userId);

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const countAfter = queryHealthRecordCount(dbPath, userId);
    expect(countAfter).toBe(countBefore);
  });

  it("dismissed nudge no longer appears in GET /nudges", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Will be dismissed.");

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/dismiss`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const listRes = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(listRes.status).toBe(200);
    const ids = (listRes.body.data as { id: string }[]).map((n) => n.id);
    expect(ids).not.toContain(nudgeId);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/recommendations/nudges/:id/mark-done
// ---------------------------------------------------------------------------

describe("POST /api/v1/recommendations/nudges/:id/mark-done", () => {
  it("returns 401 when no token is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).post(
      "/api/v1/recommendations/nudges/some-id/mark-done",
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when nudge does not exist", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);

    const res = await supertest(app)
      .post(`/api/v1/recommendations/nudges/${randomUUID()}/mark-done`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 when nudge belongs to another user", async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userA);
    seedUser(dbPath, userB);
    const nudgeId = seedNudge(dbPath, userB, "Belongs to B.");

    const res = await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/mark-done`)
      .set("Authorization", `Bearer ${makeToken(userA)}`);

    expect(res.status).toBe(404);
  });

  it("returns 200 and data.status is 'done'", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Mark me done.");

    const res = await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/mark-done`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(nudgeId);
    expect(res.body.data.status).toBe("done");
  });

  it("inserts an engagement_events row with event_type='nudge_dismiss' when marked done", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Track mark-done event.");

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/mark-done`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const rows = queryEngagementEvents(dbPath, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!["event_type"]).toBe("nudge_dismiss");
    expect(rows[0]!["user_id"]).toBe(userId);
  });

  it("engagement_events row event_context_json contains nudge_id equal to the mark-done nudge's id", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Context check mark-done.");

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/mark-done`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const rows = queryEngagementEvents(dbPath, userId);
    expect(rows).toHaveLength(1);
    const parsed = JSON.parse(rows[0]!["event_context_json"] as string);
    expect(parsed.nudge_id).toBe(nudgeId);
  });

  it("marked-done nudge no longer appears in GET /nudges", async () => {
    const userId = randomUUID();
    const dbPath = join(ctx.tmpDir, "test.db");
    const app = await buildApp();
    seedUser(dbPath, userId);
    const nudgeId = seedNudge(dbPath, userId, "Will be done.");

    await supertest(app)
      .post(`/api/v1/recommendations/nudges/${nudgeId}/mark-done`)
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    const listRes = await supertest(app)
      .get("/api/v1/recommendations/nudges")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(listRes.status).toBe(200);
    const ids = (listRes.body.data as { id: string }[]).map((n) => n.id);
    expect(ids).not.toContain(nudgeId);
  });
});

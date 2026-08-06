import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
const TEST_JWT_SECRET = "test-jwt-secret-alertsroutes";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "alertsroutes-test-"));
  }

  get tmpDir(): string {
    return this._tmpDir;
  }

  get consoleSpy(): ReturnType<typeof vi.spyOn> {
    if (!this._consoleSpy) throw new Error("consoleSpy not started");
    return this._consoleSpy;
  }

  startConsoleSpy(): void {
    this._consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  }

  cleanup(): void {
    this._consoleSpy?.mockRestore();
    rmSync(this._tmpDir, { recursive: true, force: true });
  }
}

let ctx: TestContext;

beforeEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx = new TestContext();
  ctx.startConsoleSpy();
  vi.resetModules();
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env["DB_PATH"];
  delete process.env["JWT_SECRET"];
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env["DB_PATH"] = dbPath;
  process.env["JWT_SECRET"] = TEST_JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { alertsRouter } = await import("../api/alertsRoutes.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/alerts", authMiddleware(TEST_JWT_SECRET), alertsRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId, email: `${userId}@example.com` }, TEST_JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function seedUser(dbPath: string, userId: string): Promise<void> {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
  db.close();
}

async function seedAlert(userId: string): Promise<number> {
  const { getDatabase } = await import("../db/connection.js");
  const { AlertDao } = await import("../repositories/AlertDao.js");
  const db = getDatabase();
  const dao = new AlertDao(db);
  const alert = dao.create({
    userId,
    category: "stale_data",
    priority: "medium",
    message: "Smartwatch data is stale.",
  });
  return alert.id;
}

function parseLogEntry(call: unknown[]): Record<string, unknown> | null {
  try {
    const parsed = typeof call[0] === "string" ? JSON.parse(call[0]) : call[0];
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch { /* skip */ }
  return null;
}

function findLogEvent(calls: unknown[][], event: string): Record<string, unknown> | undefined {
  for (const call of calls) {
    const parsed = parseLogEntry(call);
    if (parsed && parsed["event"] === event) return parsed;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// POST /api/v1/alerts/generate — authentication
// ---------------------------------------------------------------------------

describe("POST /api/v1/alerts/generate — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/alerts/generate").send({});
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when unauthenticated", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/alerts/generate").send({});
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/alerts/generate — success
// ---------------------------------------------------------------------------

describe("POST /api/v1/alerts/generate — success", () => {
  it("returns HTTP 200 with data.count when no alerts are generated", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-gen-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/alerts/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const body = res.body as { data: { count: number } };
    expect(body.data.count).toBe(0);
  });

  it("returns data.count matching the number of newly inserted alerts", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-gen-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Seed a device with a failed sync so evaluateAndPersist generates an alert
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    const connId = "conn-gen-2";
    db.prepare(
      `INSERT INTO device_connections (id, user_id, device_type, connection_status, connected_since, last_successful_sync_at)
       VALUES (?, ?, 'smartwatch', 'connected', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
    ).run(connId, userId);
    db.prepare(
      `INSERT INTO sync_runs (id, device_connection_id, sync_status, started_at, finished_at)
       VALUES ('run-gen-2', ?, 'failed', '2020-01-02T00:00:00Z', '2020-01-02T00:00:00Z')`,
    ).run(connId);
    db.close();

    const res = await supertest(app)
      .post("/api/v1/alerts/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const body = res.body as { data: { count: number } };
    expect(body.data.count).toBeGreaterThanOrEqual(1);
  });

  it("response includes meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-gen-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/alerts/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const body = res.body as { meta: { correlationId: string } };
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("uses authenticated user_id, not body user_id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-gen-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Sending a different user_id in body — auth user wins
    const res = await supertest(app)
      .post("/api/v1/alerts/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({ user_id: "other-user" });

    expect(res.status).toBe(200);
  });

  it("emits alerts.generated log entries for each new alert with category, priority, user_id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-gen-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    const connId = "conn-gen-5";
    db.prepare(
      `INSERT INTO device_connections (id, user_id, device_type, connection_status, connected_since, last_successful_sync_at)
       VALUES (?, ?, 'smartwatch', 'connected', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
    ).run(connId, userId);
    db.prepare(
      `INSERT INTO sync_runs (id, device_connection_id, sync_status, started_at, finished_at)
       VALUES ('run-gen-5', ?, 'failed', '2020-01-02T00:00:00Z', '2020-01-02T00:00:00Z')`,
    ).run(connId);
    db.close();

    await supertest(app)
      .post("/api/v1/alerts/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const genLog = findLogEvent(ctx.consoleSpy.mock.calls, "alerts.generated");
    expect(genLog).toBeDefined();
    expect(genLog!["category"]).toBeDefined();
    expect(genLog!["priority"]).toBeDefined();
    expect(genLog!["user_id"]).toBe(userId);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/alerts — authentication
// ---------------------------------------------------------------------------

describe("GET /api/v1/alerts — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/alerts");
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when unauthenticated", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/alerts");
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/alerts — success
// ---------------------------------------------------------------------------

describe("GET /api/v1/alerts — success", () => {
  it("returns HTTP 200 with data as an empty array when no unacknowledged alerts exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("returns only unacknowledged alerts in data", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const alertId = await seedAlert(userId);

    // Acknowledge the alert directly in the DB
    const db = new Database(dbPath);
    db.prepare("UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      alertId,
    );
    db.close();

    const res = await supertest(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("returns unacknowledged alerts in data with correct fields", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const alertId = await seedAlert(userId);

    const res = await supertest(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Array<{ id: number; userId: string; acknowledged: boolean }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(alertId);
    expect(body.data[0].userId).toBe(userId);
    expect(body.data[0].acknowledged).toBe(false);
  });

  it("returns alerts ordered by createdAt DESC", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Seed two alerts with explicit created_at values
    const db = new Database(dbPath);
    db.prepare(
      `INSERT INTO alerts (user_id, category, priority, message, entity_id, entity_type, acknowledged, created_at)
       VALUES (?, 'stale_data', 'low', 'First alert', 'e1', 'device_connection', 0, '2026-01-01T00:00:00.000Z')`,
    ).run(userId);
    db.prepare(
      `INSERT INTO alerts (user_id, category, priority, message, entity_id, entity_type, acknowledged, created_at)
       VALUES (?, 'sync_failure', 'high', 'Second alert', 'e2', 'device_connection', 0, '2026-01-02T00:00:00.000Z')`,
    ).run(userId);
    db.close();

    const res = await supertest(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Array<{ createdAt: string }> };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(body.data[1].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not return alerts belonging to a different user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-5";
    const otherUserId = "user-list-5-other";
    await seedUser(dbPath, userId);
    await seedUser(dbPath, otherUserId);
    const token = makeToken(userId);

    await seedAlert(otherUserId);

    const res = await supertest(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("response includes meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { meta: { correlationId: string } };
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/alerts/:id/acknowledge — authentication
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/alerts/:id/acknowledge (via alertsRoutes) — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).patch("/api/v1/alerts/1/acknowledge");
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when unauthenticated", async () => {
    const app = await buildApp();
    const res = await supertest(app).patch("/api/v1/alerts/1/acknowledge");
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/alerts/:id/acknowledge — success (HTTP 204)
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/alerts/:id/acknowledge (via alertsRoutes) — success", () => {
  it("returns HTTP 204 on a valid acknowledge request", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-patch-1";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it("returns no body on a valid acknowledge request", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-patch-2";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("persists acknowledged=1 in the database after the call", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-patch-3";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT acknowledged FROM alerts WHERE id = ?")
      .get(alertId) as { acknowledged: number } | undefined;
    db.close();

    expect(row?.acknowledged).toBe(1);
  });

  it("emits alerts.acknowledged log with alert_id and user_id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-patch-4";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const ackLog = findLogEvent(ctx.consoleSpy.mock.calls, "alerts.acknowledged");
    expect(ackLog).toBeDefined();
    expect(ackLog!["alert_id"]).toBe(alertId);
    expect(ackLog!["user_id"]).toBe(userId);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/alerts/:id/acknowledge — not found (HTTP 404)
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/alerts/:id/acknowledge (via alertsRoutes) — not found", () => {
  it("returns HTTP 404 when the alert id does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-nf-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch("/api/v1/alerts/99999/acknowledge")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("returns error.type RESOURCE_NOT_FOUND when the alert does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-nf-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch("/api/v1/alerts/99999/acknowledge")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns HTTP 404 when alert belongs to a different user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const ownerUserId = "user-nf-owner";
    const otherUserId = "user-nf-other";
    await seedUser(dbPath, ownerUserId);
    await seedUser(dbPath, otherUserId);
    const alertId = await seedAlert(ownerUserId);
    const token = makeToken(otherUserId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("does not emit alerts.acknowledged log when alert does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-nf-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch("/api/v1/alerts/99999/acknowledge")
      .set("Authorization", `Bearer ${token}`);

    const ackLog = findLogEvent(ctx.consoleSpy.mock.calls, "alerts.acknowledged");
    expect(ackLog).toBeUndefined();
  });
});

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
const TEST_JWT_SECRET = "test-jwt-secret-alerts";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "alerts-ack-test-"));
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

/** Seed an alert using AlertDao so the correct schema (post-migration) is used. */
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

// ---------------------------------------------------------------------------
// Authentication guard
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/alerts/:id/acknowledge — authentication", () => {
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
// Successful acknowledge
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/alerts/:id/acknowledge — success", () => {
  it("returns HTTP 200 on a valid acknowledge request", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-1";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("sets acknowledged=true in the response data.alert", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-2";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { alert: { acknowledged: boolean } } };
    expect(body.data.alert.acknowledged).toBe(true);
  });

  it("sets a valid ISO 8601 acknowledgedAt timestamp in the response data.alert", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-3";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { alert: { acknowledgedAt: string } } };
    expect(body.data.alert.acknowledgedAt).not.toBeNull();
    expect(new Date(body.data.alert.acknowledgedAt).toISOString()).toBe(
      body.data.alert.acknowledgedAt,
    );
  });

  it("persists acknowledged=1 on the database row after the call", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-4";
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

  it("the alerts row still exists after acknowledging (row not deleted)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-5";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM alerts WHERE id = ?")
      .get(alertId) as { id: number } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.id).toBe(alertId);
  });

  it("does not delete or modify any co-existing health_record row for the same user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-6";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    // Seed a health_record for the same user; acknowledge should not touch it
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    const connId = "conn-ack-6";
    db.prepare(
      `INSERT INTO device_connections (id, user_id, device_type, connection_status, connected_since)
       VALUES (?, ?, 'smartwatch', 'connected', '2026-01-01T00:00:00Z')`,
    ).run(connId, userId);
    db.prepare(
      `INSERT INTO health_records (id, user_id, device_connection_id, metric_domain, source_type,
        metric_name, value, recorded_at)
       VALUES ('hr-ack-6', ?, ?, 'activity', 'smartwatch', 'steps', 7000, '2026-01-01T00:00:00Z')`,
    ).run(userId, connId);
    db.close();

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const db2 = new Database(dbPath);
    const hr = db2
      .prepare("SELECT id FROM health_records WHERE id = 'hr-ack-6'")
      .get() as { id: string } | undefined;
    db2.close();

    expect(hr).toBeDefined();
    expect(hr?.id).toBe("hr-ack-6");
  });

  it("emits a console log with event='alerts.acknowledged' after successful acknowledge", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-7";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const calls = ctx.consoleSpy.mock.calls;
    const ackLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "alerts.acknowledged",
    );
    expect(ackLog).toBeDefined();
  });

  it("emits alerts.acknowledged log with alert_id matching the acknowledged alert", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-8";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const calls = ctx.consoleSpy.mock.calls;
    const ackLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "alerts.acknowledged",
    );
    expect(ackLog).toBeDefined();
    if (!ackLog) throw new Error("alerts.acknowledged log not found");
    expect((ackLog[0] as Record<string, unknown>)["alert_id"]).toBe(alertId);
  });

  it("emits alerts.acknowledged log with user_id matching the authenticated user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-9";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const calls = ctx.consoleSpy.mock.calls;
    const ackLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "alerts.acknowledged",
    );
    expect(ackLog).toBeDefined();
    if (!ackLog) throw new Error("alerts.acknowledged log not found");
    expect((ackLog[0] as Record<string, unknown>)["user_id"]).toBe(userId);
  });

  it("response includes meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ack-10";
    await seedUser(dbPath, userId);
    const alertId = await seedAlert(userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { meta: { correlationId: string } };
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// Non-existent alert — 404
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/alerts/:id/acknowledge — not found", () => {
  it("returns 404 when the alert id=99999 does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-404-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch("/api/v1/alerts/99999/acknowledge")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("returns error.type RESOURCE_NOT_FOUND when the alert id does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-404-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .patch("/api/v1/alerts/99999/acknowledge")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("RESOURCE_NOT_FOUND");
  });

  it("does not emit alerts.acknowledged log when alert id does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-404-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .patch("/api/v1/alerts/99999/acknowledge")
      .set("Authorization", `Bearer ${token}`);

    const calls = ctx.consoleSpy.mock.calls;
    const ackLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "alerts.acknowledged",
    );
    expect(ackLog).toBeUndefined();
  });

  it("returns 404 when alert belongs to a different user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const ownerUserId = "user-404-owner";
    const otherUserId = "user-404-other";
    await seedUser(dbPath, ownerUserId);
    await seedUser(dbPath, otherUserId);
    const alertId = await seedAlert(ownerUserId);
    const token = makeToken(otherUserId);

    const res = await supertest(app)
      .patch(`/api/v1/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

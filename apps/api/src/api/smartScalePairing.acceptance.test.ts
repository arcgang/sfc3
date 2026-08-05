// Acceptance tests: Smart scale pairing story
// Covers AC4 (DB row created, device.paired emitted) and AC6 (PUT /api/v1/devices/connections mechanism)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

// Far-future constant used for fixture timestamps — avoids wall-clock coupling.
const FIXTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);
const TEST_JWT_SECRET = "test-jwt-secret-scale-acceptance";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "scale-acceptance-test-"));
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
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { devicesRouter } = await import("./devicesRoutes.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/devices", authMiddleware(TEST_JWT_SECRET), devicesRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@example.com` },
    TEST_JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function seedUser(dbPath: string, userId: string): Promise<void> {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
  db.close();
}

// ---------------------------------------------------------------------------
// AC4 + AC6: PUT /api/v1/devices/connections with action='connect' is the mechanism
// that creates a device_connections row with device_type='smart_scale' and
// connection_status='connected', and emits a device.paired console log event.
// ---------------------------------------------------------------------------

describe("Acceptance AC4+AC6: smart scale pairing via PUT /api/v1/devices/connections", () => {
  it("precondition: device_connections table exists with smart_scale in device_type CHECK constraint", async () => {
    await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");

    const db = new Database(dbPath);
    const tableRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='device_connections'")
      .get() as { name: string } | undefined;
    const checkSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='device_connections'")
      .get() as { sql: string } | undefined;
    db.close();

    expect(tableRow).toBeDefined();
    expect(checkSql?.sql).toContain("smart_scale");
  });

  it("AC6: PUT /api/v1/devices/connections with action='connect' and deviceType='smart_scale' returns HTTP 200 with status='connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ac6-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { deviceType: string; status: string } } };
    expect(body.data.device.deviceType).toBe("smart_scale");
    expect(body.data.device.status).toBe("connected");
  });

  it("AC4: creates a device_connections row with device_type='smart_scale' and connection_status='connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ac4-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT device_type, connection_status FROM device_connections WHERE user_id = ?",
      )
      .get(userId) as { device_type: string; connection_status: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.device_type).toBe("smart_scale");
    expect(row?.connection_status).toBe("connected");
  });

  it("AC4: emits a device.paired console log event with deviceType='smart_scale' and the userId", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ac4-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired" &&
        (call[0] as Record<string, unknown>)["deviceType"] === "smart_scale",
    );

    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found for smart_scale");
    const logObj = pairedLog[0] as Record<string, unknown>;
    expect(logObj["userId"]).toBe(userId);
    expect(logObj["connectionId"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("AC4: emits device.paired (not device.reconnected) on the very first connect for a new smart_scale", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ac4-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    const reconnectedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.reconnected",
    );
    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );

    expect(reconnectedLog).toBeUndefined();
    expect(pairedLog).toBeDefined();
  });

  it("AC4: a second connect on an already-connected smart_scale returns 409 DEVICE_STATE_CONFLICT (row is not duplicated)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ac4-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    expect(res.status).toBe(409);
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("DEVICE_STATE_CONFLICT");

    const db = new Database(dbPath);
    const rows = db
      .prepare("SELECT id FROM device_connections WHERE user_id = ? AND device_type = 'smart_scale'")
      .all(userId) as { id: string }[];
    db.close();
    expect(rows.length).toBe(1);
  });

  // Regression guard: smart_scale and smartwatch connections for the same user are independent rows.
  it("AC4+AC6: connecting both smart_scale and smartwatch creates two independent rows", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ac4-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect" });

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT device_type, connection_status FROM device_connections WHERE user_id = ? ORDER BY device_type",
      )
      .all(userId) as { device_type: string; connection_status: string }[];
    db.close();

    expect(rows.length).toBe(2);
    const types = rows.map((r) => r.device_type).sort();
    expect(types).toEqual(["smart_scale", "smartwatch"]);
    expect(rows.every((r) => r.connection_status === "connected")).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

// Far-future constant used for fixture timestamps — avoids absolute wall-clock dates.
const FIXTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);
const TEST_JWT_SECRET = "test-jwt-secret-devices";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "devices-ctrl-test-"));
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
  // Close the previous test's singleton before wiping the module registry,
  // so we hold a reference to the old module's resetDatabase function.
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx = new TestContext();
  ctx.startConsoleSpy();
  vi.resetModules();
});

afterEach(async () => {
  // Close the current test's singleton (opened by buildApp) before cleanup.
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
  return jwt.sign({ sub: userId, email: `${userId}@example.com` }, TEST_JWT_SECRET, { expiresIn: "1h" });
}

async function seedUser(dbPath: string, userId: string): Promise<void> {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
  db.close();
}

// ---------------------------------------------------------------------------
// Authentication guard
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .send({ deviceType: "smartwatch", action: "connect" });
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when unauthenticated", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .send({ deviceType: "smartwatch", action: "connect" });
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });
});

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — validation", () => {
  it("returns 422 when deviceType is missing", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "connect" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when action is missing", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when deviceType is not smartwatch or smart_scale", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "treadmill", action: "connect" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when action is not in the allowed enum", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "pair" });
    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED on validation failure", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "connect" });
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns 422 when syncWindowHours is below 1", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "sync", syncWindowHours: 0 });
    expect(res.status).toBe(422);
  });

  it("returns 422 when syncWindowHours exceeds 168", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-7";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "sync", syncWindowHours: 169 });
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// action=connect (smartwatch pairing — the main acceptance criterion)
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=connect (smartwatch)", () => {
  it("returns HTTP 200", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", providerAccountRef: "fitbit-acc-001" });

    expect(res.status).toBe(200);
  });

  it("returns data.device.deviceType = 'smartwatch'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", providerAccountRef: "fitbit-acc-002" });

    const body = res.body as { data: { device: { deviceType: string } } };
    expect(body.data.device.deviceType).toBe("smartwatch");
  });

  it("returns data.device.status = 'connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("connected");
  });

  it("returns data.device.lastSyncAt as null on initial connect", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const body = res.body as { data: { device: { lastSyncAt: unknown } } };
    expect(body.data.device.lastSyncAt).toBeNull();
  });

  it("creates a device_connections row with device_type='smartwatch' and connection_status='connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", providerAccountRef: "garmin-acc-1" });

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT device_type, connection_status FROM device_connections WHERE user_id = ?",
      )
      .get(userId) as { device_type: string; connection_status: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.device_type).toBe("smartwatch");
    expect(row?.connection_status).toBe("connected");
  });

  it("emits a device.paired console log event with a UUID connectionId", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const calls = ctx.consoleSpy.mock.calls;
    const pairedLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found");
    expect((pairedLog[0] as Record<string, unknown>)["connectionId"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("emits device.paired log with userId in the payload", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-7";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const calls = ctx.consoleSpy.mock.calls;
    const pairedLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found");
    expect((pairedLog[0] as Record<string, unknown>)["userId"]).toBe(userId);
  });

  it("emits device.paired log with deviceType in the payload", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-8";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const calls = ctx.consoleSpy.mock.calls;
    const pairedLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found");
    expect((pairedLog[0] as Record<string, unknown>)["deviceType"]).toBe("smartwatch");
  });

  it("response includes meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-9";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const body = res.body as { meta: { correlationId: string } };
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("response includes meta.timestamp as ISO 8601 UTC", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conn-10";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const body = res.body as { meta: { timestamp: string } };
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  });
});

// ---------------------------------------------------------------------------
// action=connect (smart_scale)
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=connect (smart_scale)", () => {
  it("returns HTTP 200 and status=connected for smart_scale", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-scale-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect", providerAccountRef: "scale-acc-1" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { status: string; deviceType: string } } };
    expect(body.data.device.status).toBe("connected");
    expect(body.data.device.deviceType).toBe("smart_scale");
  });
});

// ---------------------------------------------------------------------------
// action=connect — conflict: device already connected
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=connect conflict", () => {
  it("returns 409 when the device is already connected", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conflict-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // First connection succeeds
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    // Second connection attempt on same device type
    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    expect(res.status).toBe(409);
  });

  it("returns error.type DEVICE_STATE_CONFLICT on duplicate connect", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conflict-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("DEVICE_STATE_CONFLICT");
  });
});

// ---------------------------------------------------------------------------
// action=disconnect
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=disconnect", () => {
  it("returns 409 when attempting to disconnect a device that is not connected", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-disc-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "disconnect" });

    expect(res.status).toBe(409);
  });

  it("returns 200 and status=disconnected when disconnecting a connected device", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-disc-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Connect first
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    // Then disconnect
    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "disconnect" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("disconnected");
  });
});

// ---------------------------------------------------------------------------
// action=reconnect
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=reconnect", () => {
  it("returns 409 when no prior connection record exists", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-recon-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "reconnect" });

    expect(res.status).toBe(409);
  });

  it("returns 200 and status=connected after reconnecting a disconnected device", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-recon-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Connect then disconnect
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "disconnect" });

    // Reconnect
    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "reconnect" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("connected");
  });
});

// ---------------------------------------------------------------------------
// action=connect from error state — emits device.reconnected, not device.paired
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=connect from error state", () => {
  it("emits device.reconnected (not device.paired) when upgrading from error state", async () => {
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-err-1";

    // Build app and seed once to create the DB, then inject an error-state row
    const app = await buildApp();
    await seedUser(dbPath, userId);

    // Insert a pre-existing row in error state directly
    const db = new Database(dbPath);
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, connection_status, last_sync_at, created_at, updated_at)
       VALUES ('err-row-1', ?, 'smartwatch', 'error', NULL, ?, ?)`,
    ).run(userId, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
    db.close();

    const token = makeToken(userId);
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect" });

    const calls = ctx.consoleSpy.mock.calls;
    const pairedLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    const reconnectedLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.reconnected",
    );
    expect(pairedLog).toBeUndefined();
    expect(reconnectedLog).toBeDefined();
    if (!reconnectedLog) throw new Error("device.reconnected log not found");
    expect((reconnectedLog[0] as Record<string, unknown>)["event"]).toBe("device.reconnected");
  });
});

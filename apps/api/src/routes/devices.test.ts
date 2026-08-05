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
const TEST_JWT_SECRET = "test-jwt-secret-routes-devices";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "routes-devices-test-"));
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

  const { devicesRouter } = await import("./devices.js");
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

// ---------------------------------------------------------------------------
// PUT /api/v1/devices/connections — action=connect (smartwatch — acceptance criterion)
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=connect (smartwatch)", () => {
  it("returns HTTP 200 for a successful smartwatch connect", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Charge 6" });

    expect(res.status).toBe(200);
  });

  it("returns data.device.status = 'connected' for smartwatch connect", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin", deviceName: "Garmin Venu 3" });

    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("connected");
  });

  it("returns data.device.lastSyncAt = null on initial connect", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Apple" });

    const body = res.body as { data: { device: { lastSyncAt: unknown } } };
    expect(body.data.device.lastSyncAt).toBeNull();
  });

  it("creates device_connections row with device_type='smartwatch' and connection_status='connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Sense 2" });

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

  it("stores the caller-supplied provider value, not a hardcoded constant", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Polar", deviceName: "Polar Ignite 3" });

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT provider, device_name FROM device_connections WHERE user_id = ?")
      .get(userId) as { provider: string; device_name: string } | undefined;
    db.close();

    expect(row?.provider).toBe("Polar");
    expect(row?.device_name).toBe("Polar Ignite 3");
  });

  it("emits a device.paired console log event", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
  });

  it("emits device.paired log containing userId", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-7";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found");
    expect((pairedLog[0] as Record<string, unknown>)["userId"]).toBe(userId);
  });

  it("emits device.paired log containing deviceType = 'smartwatch'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-8";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
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
    const userId = "user-sw-9";
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
});

// ---------------------------------------------------------------------------
// PUT /api/v1/devices/connections — missing provider (validation)
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
      .send({ action: "connect", provider: "Fitbit" });

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
      .send({ deviceType: "smartwatch", provider: "Fitbit" });

    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED when deviceType is invalid", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "treadmill", action: "connect" });

    const body = res.body as { error: { type: string } };
    expect(res.status).toBe(422);
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/devices/connections — authentication
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when no token is provided", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .send({ deviceType: "smartwatch", action: "connect" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/devices/connections — list connected devices
// ---------------------------------------------------------------------------

describe("GET /api/v1/devices/connections", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();

    const res = await supertest(app).get("/api/v1/devices/connections");

    expect(res.status).toBe(401);
  });

  it("returns an empty devices array when no devices have been connected", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-get-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: unknown[] } };
    expect(body.data.devices).toEqual([]);
  });

  it("returns the connected smartwatch after it is paired", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-get-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Connect the device
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Inspire 3" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: Array<{ deviceType: string; status: string }> } };
    expect(body.data.devices.length).toBe(1);
    expect(body.data.devices[0]?.deviceType).toBe("smartwatch");
    expect(body.data.devices[0]?.status).toBe("connected");
  });

  it("GET returns data.devices[0].lastSyncAt for the connected smartwatch", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-get-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<{ lastSyncAt: unknown }> } };
    expect(body.data.devices.length).toBe(1);
    // lastSyncAt is null on initial connect; field must be present
    expect(Object.prototype.hasOwnProperty.call(body.data.devices[0], "lastSyncAt")).toBe(true);
  });

  it("GET response includes meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-get-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { meta: { correlationId: string } };
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// action=connect — conflict: device already connected
// ---------------------------------------------------------------------------

describe("PUT /api/v1/devices/connections — action=connect conflict", () => {
  it("returns 409 when the smartwatch is already connected", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-conf-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    expect(res.status).toBe(409);
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("DEVICE_STATE_CONFLICT");
  });
});

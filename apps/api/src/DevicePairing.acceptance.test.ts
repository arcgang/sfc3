/**
 * Acceptance tests — "Pair a smartwatch to start tracking activity and vitals"
 *
 * These exercise the SEAM between the two backend tasks:
 *   - PUT /api/v1/devices/connections (create/update a device connection)
 *   - GET /api/v1/devices/connections (list device connections)
 *
 * Unit tests for each task already cover each endpoint in isolation.
 * What no existing test covers is:
 *   AC3: the full PUT→GET round-trip producing all fields the frontend needs
 *   AC4: database row + console event on the first real pairing path
 *   AC6: the PUT response shape (status + lastSyncAt) from the routes module
 */

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
  "db/migrations",
);
const TEST_JWT_SECRET = "test-jwt-secret-pairing-acceptance";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "pairing-acceptance-"));
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
  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();
  ctx = new TestContext();
  ctx.startConsoleSpy();
  vi.resetModules();
});

afterEach(async () => {
  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { migrate } = await import("./db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { devicesRouter } = await import("./routes/devices.js");
  const { authMiddleware } = await import("./middleware/auth.js");
  const { correlationIdMiddleware } = await import("./middleware/correlationId.js");
  const { errorHandler } = await import("./middleware/errorHandler.js");

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
// Precondition: schema migration must have been applied
// ---------------------------------------------------------------------------

describe("precondition — device_connections schema migration is applied", () => {
  it("device_connections table has device_type and connection_status columns", async () => {
    const dbPath = join(ctx.tmpDir, "precond.db");
    process.env.DB_PATH = dbPath;
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const { migrate } = await import("./db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("./db/connection.js");
    const db = getDatabase();

    // A query that references both key columns throws if either is absent.
    // An empty result is fine; an error means the migration wasn't applied.
    const row = db
      .prepare(
        "SELECT device_type, connection_status FROM device_connections LIMIT 0",
      )
      .get();
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC6 — PUT response includes device.status='connected' and data.device.lastSyncAt
// ---------------------------------------------------------------------------

describe("AC6 — PUT /api/v1/devices/connections action=connect response shape", () => {
  it("response data.device.status is 'connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac6-status-1";
    await seedUser(dbPath, userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({
        deviceType: "smartwatch",
        action: "connect",
        provider: "Fitbit",
        deviceName: "Fitbit Charge 6",
      });

    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("connected");
  });

  it("response data.device.lastSyncAt is present and null on initial connect", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac6-lastsync-1";
    await seedUser(dbPath, userId);

    const res = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin" });

    const body = res.body as { data: { device: Record<string, unknown> } };
    expect(Object.prototype.hasOwnProperty.call(body.data.device, "lastSyncAt")).toBe(true);
    expect(body.data.device["lastSyncAt"]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC4 — database row written + device.paired console event emitted
// ---------------------------------------------------------------------------

describe("AC4 — device_connections row and device.paired event on first smartwatch pair", () => {
  it("creates a row with device_type='smartwatch' and connection_status='connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-row-1";
    await seedUser(dbPath, userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({
        deviceType: "smartwatch",
        action: "connect",
        provider: "Fitbit",
        deviceName: "Fitbit Sense 2",
      });

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

  it("emits a device.paired console log event", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-event-1";
    await seedUser(dbPath, userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
  });

  it("device.paired log contains the correct userId and deviceType='smartwatch'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-event-2";
    await seedUser(dbPath, userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found");
    const logObj = pairedLog[0] as Record<string, unknown>;
    expect(logObj["userId"]).toBe(userId);
    expect(logObj["deviceType"]).toBe("smartwatch");
  });

  it("device.paired log contains a connectionId that is a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-event-3";
    await seedUser(dbPath, userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Withings" });

    const pairedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.paired",
    );
    expect(pairedLog).toBeDefined();
    if (!pairedLog) throw new Error("device.paired log not found");
    const logObj = pairedLog[0] as Record<string, unknown>;
    expect(typeof logObj["connectionId"]).toBe("string");
    expect(logObj["connectionId"] as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// AC3 (seam) — PUT→GET round-trip: all fields the frontend ConnectedDevicesPage
// requires are present in the GET /api/v1/devices/connections response
// ---------------------------------------------------------------------------

describe("AC3 seam — GET /api/v1/devices/connections returns all fields the frontend needs after pairing", () => {
  it("returns exactly 1 device in data.devices after pairing one smartwatch", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Charge 6" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: unknown[] } };
    expect(body.data.devices).toHaveLength(1);
  });

  it("GET response device has deviceType='smartwatch'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Charge 6" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    expect(body.data.devices[0]?.["deviceType"]).toBe("smartwatch");
  });

  it("GET response device has status='connected' (maps connectionStatus→status for frontend)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    expect(body.data.devices[0]?.["status"]).toBe("connected");
  });

  it("GET response device has deviceName matching the value sent on PUT", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Charge 6" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    expect(body.data.devices[0]?.["deviceName"]).toBe("Fitbit Charge 6");
  });

  it("GET response device has provider matching the value sent on PUT", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Apple Watch", deviceName: "Apple Watch Ultra 2" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    expect(body.data.devices[0]?.["provider"]).toBe("Apple Watch");
  });

  it("GET response device has lastSyncAt field (null on initial connect)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    const device = body.data.devices[0]!;
    expect(Object.prototype.hasOwnProperty.call(device, "lastSyncAt")).toBe(true);
    expect(device["lastSyncAt"]).toBeNull();
  });

  it("GET response device has batteryLevel field present", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-7";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    const device = body.data.devices[0]!;
    expect(Object.prototype.hasOwnProperty.call(device, "batteryLevel")).toBe(true);
  });

  it("GET response device has a non-empty connectedSince ISO string", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-8";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Withings" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    const connectedSince = body.data.devices[0]?.["connectedSince"];
    expect(typeof connectedSince).toBe("string");
    expect((connectedSince as string).length).toBeGreaterThan(0);
    // Must be parseable as a valid date
    expect(isNaN(new Date(connectedSince as string).getTime())).toBe(false);
  });

  it("GET response device has an id field (a non-empty string)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-seam-9";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin", deviceName: "Garmin Venu 3" });

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { devices: Array<Record<string, unknown>> } };
    const id = body.data.devices[0]?.["id"];
    expect(typeof id).toBe("string");
    expect((id as string).length).toBeGreaterThan(0);
  });
});

/**
 * Acceptance tests for "View and manage all connected device statuses" — backend side.
 *
 * These tests exercise the API contract that the Connected Devices screen
 * (apps/web) depends on. The frontend task unit tests mock apiFetch; these
 * tests prove the real endpoint produces the exact shape and values the
 * frontend UI needs.
 *
 * Seam under test: GET /devices/connections (authenticated) → toDeviceDto()
 * → DeviceDto consumed by ConnectedDevicesPage.
 *
 * Criterion labels map to the story's acceptance criteria.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
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
const TEST_JWT_SECRET = "test-jwt-secret-connected-devices-acceptance";

class TestContext {
  private readonly _tmpDir: string;
  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "connected-devices-acc-"));
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
  const { correlationIdMiddleware } = await import(
    "../middleware/correlationId.js"
  );
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/api/v1/devices",
    authMiddleware(TEST_JWT_SECRET),
    devicesRouter,
  );
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

async function connectDevice(
  app: ReturnType<typeof express>,
  userId: string,
  payload: {
    deviceType: "smartwatch" | "smart_scale";
    provider: string;
    deviceName: string;
    batteryLevel?: string;
  },
): Promise<string> {
  const token = makeToken(userId);
  const res = await supertest(app)
    .put("/api/v1/devices/connections")
    .set("Authorization", `Bearer ${token}`)
    .send({
      deviceType: payload.deviceType,
      action: "connect",
      provider: payload.provider,
      deviceName: payload.deviceName,
    });
  const body = res.body as { data: { device: { id: string } } };
  return body.data.device.id;
}

// ── Precondition ──────────────────────────────────────────────────────────────

describe("Precondition: migration infrastructure", () => {
  it("migrations directory exists and contains at least one migration file", () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const files = readdirSync(MIGRATIONS_DIR);
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it("GET /devices/connections returns 200 after migrations run", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "pre-user-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── AC1: all paired devices listed ───────────────────────────────────────────

describe("AC1 — GET /devices/connections lists every paired device for the user", () => {
  it("returns both devices when user has connected a smartwatch and a smart scale", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac1-user-1";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Fitbit",
      deviceName: "Fitbit Charge 5",
    });
    await connectDevice(app, userId, {
      deviceType: "smart_scale",
      provider: "Withings",
      deviceName: "Withings Body+",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { devices: Array<{ deviceName: string }> };
    };
    expect(body.data.devices.length).toBe(2);
    const names = body.data.devices.map((d) => d.deviceName);
    expect(names).toContain("Fitbit Charge 5");
    expect(names).toContain("Withings Body+");
  });

  it("does not return devices belonging to a different user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const ownerUserId = "ac1-owner-1";
    const otherUserId = "ac1-other-1";
    await seedUser(dbPath, ownerUserId);
    await seedUser(dbPath, otherUserId);

    await connectDevice(app, ownerUserId, {
      deviceType: "smartwatch",
      provider: "Garmin",
      deviceName: "Garmin Venu 3",
    });

    const token = makeToken(otherUserId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { devices: unknown[] } };
    expect(body.data.devices.length).toBe(0);
  });
});

// ── AC2: DTO shape — all fields the frontend DeviceCard requires ──────────────

describe("AC2 — GET /devices/connections DTO includes every field the Connected Devices screen renders", () => {
  it("response DTO includes 'batteryLevel' field — frontend renders battery status", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac2-user-1";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Fitbit",
      deviceName: "Fitbit Charge 5",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<Record<string, unknown>> };
    };
    expect(body.data.devices.length).toBe(1);
    expect(
      Object.prototype.hasOwnProperty.call(body.data.devices[0], "batteryLevel"),
    ).toBe(true);
  });

  it("response DTO includes 'connectedSince' field — frontend renders connected-since date", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac2-user-2";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Apple",
      deviceName: "Apple Watch Series 9",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<Record<string, unknown>> };
    };
    expect(body.data.devices.length).toBe(1);
    expect(
      Object.prototype.hasOwnProperty.call(body.data.devices[0], "connectedSince"),
    ).toBe(true);
    expect(typeof body.data.devices[0]?.["connectedSince"]).toBe("string");
  });

  it("response DTO field is named 'status' (not 'connectionStatus') — matches frontend DeviceDto interface", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac2-user-3";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smart_scale",
      provider: "Withings",
      deviceName: "Withings Body+",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<Record<string, unknown>> };
    };
    expect(body.data.devices.length).toBe(1);
    const device = body.data.devices[0];
    expect(Object.prototype.hasOwnProperty.call(device, "status")).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(device, "connectionStatus"),
    ).toBe(false);
  });

  it("response DTO includes 'deviceName' equal to the caller-supplied value", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac2-user-4";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Garmin",
      deviceName: "Garmin Instinct 2",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<{ deviceName: string }> };
    };
    expect(body.data.devices[0]?.deviceName).toBe("Garmin Instinct 2");
  });

  it("response DTO includes 'deviceType' equal to the connected type", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac2-user-5";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smart_scale",
      provider: "Withings",
      deviceName: "Withings Body Cardio",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<{ deviceType: string }> };
    };
    expect(body.data.devices[0]?.deviceType).toBe("smart_scale");
  });
});

// ── AC3: status values — stale (pending) and sync-failed (error) ─────────────

describe("AC3 — GET /devices/connections preserves the status values the frontend maps to badge text", () => {
  it("returns status='pending' for a device whose DB row has connection_status='pending' (stale → ⚠ Stale Data badge)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-user-1";
    await seedUser(dbPath, userId);

    const deviceId = await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Fitbit",
      deviceName: "Fitbit Inspire 3",
    });

    // Force the device into "pending" (stale) state directly in the DB
    const db = new Database(dbPath);
    db.prepare(
      "UPDATE device_connections SET connection_status = 'pending' WHERE id = ?",
    ).run(deviceId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<{ status: string }> };
    };
    expect(body.data.devices.length).toBe(1);
    expect(body.data.devices[0]?.status).toBe("pending");
  });

  it("returns status='error' for a device whose DB row has connection_status='error' (sync-failed → ✗ Sync Failed badge)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-user-2";
    await seedUser(dbPath, userId);

    const deviceId = await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Apple",
      deviceName: "Apple Watch Ultra",
    });

    // Force the device into "error" (sync-failed) state directly in the DB
    const db = new Database(dbPath);
    db.prepare(
      "UPDATE device_connections SET connection_status = 'error' WHERE id = ?",
    ).run(deviceId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<{ status: string }> };
    };
    expect(body.data.devices.length).toBe(1);
    expect(body.data.devices[0]?.status).toBe("error");
  });

  it("returns status='connected' for a freshly connected device (synced → ✓ Synced badge)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac3-user-3";
    await seedUser(dbPath, userId);

    await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Garmin",
      deviceName: "Garmin Forerunner 265",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as {
      data: { devices: Array<{ status: string }> };
    };
    expect(body.data.devices[0]?.status).toBe("connected");
  });
});

// ── AC4: action endpoints — reconnect and disconnect ─────────────────────────

describe("AC4 — action endpoints return the response shape the Connected Devices screen expects", () => {
  it("POST /devices/:id/reconnect returns data.device (not data.devices) with status='connected'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-user-1";
    await seedUser(dbPath, userId);

    const deviceId = await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Fitbit",
      deviceName: "Fitbit Charge 5",
    });

    // Force into "error" state so reconnect is valid
    const db = new Database(dbPath);
    db.prepare(
      "UPDATE device_connections SET connection_status = 'error' WHERE id = ?",
    ).run(deviceId);
    db.close();

    // The real app mounts all device routes behind authMiddleware — include a token
    const token = makeToken(userId);
    const res = await supertest(app)
      .post(`/api/v1/devices/${deviceId}/reconnect`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { device: { status: string; id: string } };
    };
    // The frontend expects data.device (singular), not data.devices
    expect(typeof body.data.device).toBe("object");
    expect(body.data.device).not.toBeNull();
    expect(body.data.device.status).toBe("connected");
    expect(body.data.device.id).toBe(deviceId);
  });

  it("POST /devices/:id/reconnect response includes all fields required by ReconnectResponse (deviceName, deviceType, batteryLevel, connectedSince)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-user-2";
    await seedUser(dbPath, userId);

    const deviceId = await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Fitbit",
      deviceName: "Fitbit Sense 2",
    });

    const db = new Database(dbPath);
    db.prepare(
      "UPDATE device_connections SET connection_status = 'pending' WHERE id = ?",
    ).run(deviceId);
    db.close();

    const token = makeToken(userId);
    const res = await supertest(app)
      .post(`/api/v1/devices/${deviceId}/reconnect`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const device = (res.body as { data: { device: Record<string, unknown> } })
      .data.device;
    expect(device["deviceName"]).toBe("Fitbit Sense 2");
    expect(device["deviceType"]).toBe("smartwatch");
    expect(
      Object.prototype.hasOwnProperty.call(device, "batteryLevel"),
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(device, "connectedSince"),
    ).toBe(true);
  });

  it("DELETE /devices/:id returns 204 (frontend removes card from list after 204)", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "ac4-user-3";
    await seedUser(dbPath, userId);

    const deviceId = await connectDevice(app, userId, {
      deviceType: "smartwatch",
      provider: "Apple",
      deviceName: "Apple Watch Series 9",
    });

    const token = makeToken(userId);
    const res = await supertest(app)
      .delete(`/api/v1/devices/${deviceId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

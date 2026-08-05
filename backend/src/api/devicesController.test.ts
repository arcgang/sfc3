import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import supertest from "supertest";
import { correlationIdMiddleware } from "../middleware/correlationId.js";
import { authMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";
import type { ErrorResponse } from "../types/errors.js";

const TEST_SECRET = "test-secret-for-devices";
const USER_ID = "user-abc-123";
const VALID_PAYLOAD = { sub: USER_ID, email: "alice@example.com" };

function makeToken(payload = VALID_PAYLOAD) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" });
}

// Lazily import the router after mocking the repository
async function buildApp() {
  const { devicesRouter } = await import("./devicesRoutes.js");
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(authMiddleware(TEST_SECRET));
  app.use("/api/v1/devices", devicesRouter);
  app.use(errorHandler);
  return app;
}

describe("PUT /api/v1/devices/connections — device_connections table must exist", () => {
  it("precondition: device_connections table is queryable (schema migration applied)", async () => {
    // This test will fail loudly if the schema migration hasn't been applied
    // and the table doesn't exist when the repository tries to use it.
    // We set DB_PATH to :memory: and run the migrations before using the endpoint.
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { migrate } = await import("../db/migrate.js");
    const { getDatabase } = await import("../db/connection.js");

    const migrationsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "db",
      "migrations",
    );

    process.env.DB_PATH = ":memory:";
    vi.resetModules();
    migrate(migrationsDir);
    const db = getDatabase();

    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='device_connections'",
      )
      .get() as { name: string } | undefined;

    expect(row?.name).toBe("device_connections");
    delete process.env.DB_PATH;
  });
});

describe("PUT /api/v1/devices/connections", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env.DB_PATH = ":memory:";
    // Reset module registry so each test group gets a fresh in-memory DB.
    // Then immediately run migrations using the same fresh module instances
    // that buildApp() and the router will use, so they all share one DB handle.
    vi.resetModules();
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { migrate } = await import("../db/migrate.js");
    migrate(
      join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations"),
    );
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.DB_PATH;
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  describe("authentication", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .send({ deviceType: "smart_scale", action: "connect" });
      expect(res.status).toBe(401);
    });

    it("returns 401 when an invalid token is provided", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", "Bearer not-a-valid-token")
        .send({ deviceType: "smart_scale", action: "connect" });
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  describe("request validation", () => {
    it("returns 422 when deviceType is missing", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ action: "connect" });
      expect(res.status).toBe(422);
    });

    it("returns 422 when action is missing", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale" });
      expect(res.status).toBe(422);
    });

    it("returns 422 when deviceType is not smartwatch or smart_scale", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "treadmill", action: "connect" });
      expect(res.status).toBe(422);
    });

    it("returns 422 when action is not a valid enum value", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "pair" });
      expect(res.status).toBe(422);
    });

    it("returns 422 when syncWindowHours is below minimum (1)", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "sync", syncWindowHours: 0 });
      expect(res.status).toBe(422);
    });

    it("returns 422 when syncWindowHours exceeds maximum (168)", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "sync", syncWindowHours: 200 });
      expect(res.status).toBe(422);
    });

    it("validation error body has error.type = REQUEST_VALIDATION_FAILED", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ action: "connect" });
      const body = res.body as ErrorResponse;
      expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
    });

    it("validation error body has error.details array with at least one field entry", async () => {
      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ action: "connect" });
      const body = res.body as ErrorResponse;
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // action=connect — smart_scale (core acceptance criterion)
  // -------------------------------------------------------------------------
  describe("action=connect — smart_scale", () => {
    it("returns HTTP 200 on a valid connect request", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({
          deviceType: "smart_scale",
          action: "connect",
          providerAccountRef: "withings-acc-001",
        });

      expect(res.status).toBe(200);
    });

    it("response body contains data.device.deviceType = 'smart_scale'", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      expect(res.body.data.device.deviceType).toBe("smart_scale");
    });

    it("response body contains data.device.status = 'connected'", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      expect(res.body.data.device.status).toBe("connected");
    });

    it("creates a device_connections row in the database with device_type='smart_scale' and connection_status='connected'", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      const row = db
        .prepare(
          "SELECT device_type, connection_status FROM device_connections WHERE user_id = ?",
        )
        .get(USER_ID) as
        | { device_type: string; connection_status: string }
        | undefined;

      expect(row?.device_type).toBe("smart_scale");
      expect(row?.connection_status).toBe("connected");
    });

    it("emits a device.paired console log event", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      const pairedLog = consoleSpy.mock.calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "device.paired",
      );
      expect(pairedLog).toBeDefined();
    });

    it("device.paired log includes deviceType and userId", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      const pairedLog = consoleSpy.mock.calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "device.paired",
      );
      expect(pairedLog).toBeDefined();
      if (!pairedLog) throw new Error("expected device.paired log");
      const entry = pairedLog[0] as Record<string, unknown>;
      expect(entry["deviceType"]).toBe("smart_scale");
      expect(entry["userId"]).toBe(USER_ID);
    });

    it("response body meta.correlationId is a UUID", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      expect(res.body.meta.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // action=connect — smartwatch (same contract applies)
  // -------------------------------------------------------------------------
  describe("action=connect — smartwatch", () => {
    it("returns HTTP 200 and status=connected for smartwatch", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smartwatch", action: "connect" });

      expect(res.status).toBe(200);
      expect(res.body.data.device.status).toBe("connected");
      expect(res.body.data.device.deviceType).toBe("smartwatch");
    });

    it("creates a device_connections row with device_type='smartwatch'", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smartwatch", action: "connect" });

      const row = db
        .prepare(
          "SELECT device_type, connection_status FROM device_connections WHERE user_id = ? AND device_type = 'smartwatch'",
        )
        .get(USER_ID) as
        | { device_type: string; connection_status: string }
        | undefined;

      expect(row?.device_type).toBe("smartwatch");
      expect(row?.connection_status).toBe("connected");
    });
  });

  // -------------------------------------------------------------------------
  // action=disconnect
  // -------------------------------------------------------------------------
  describe("action=disconnect", () => {
    it("returns 409 when the device is not connected (no row exists)", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "disconnect" });

      expect(res.status).toBe(409);
    });

    it("returns 409 body with error.type = DEVICE_STATE_CONFLICT", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "disconnect" });

      const body = res.body as ErrorResponse;
      expect(body.error.type).toBe("DEVICE_STATE_CONFLICT");
    });

    it("returns 200 and status=disconnected when a connected device is disconnected", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();

      // First connect
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });

      // Then disconnect
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "disconnect" });

      expect(res.status).toBe(200);
      expect(res.body.data.device.status).toBe("disconnected");
    });
  });

  // -------------------------------------------------------------------------
  // action=reconnect
  // -------------------------------------------------------------------------
  describe("action=reconnect", () => {
    it("returns 409 when device has no existing connection row", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "reconnect" });

      expect(res.status).toBe(409);
    });

    it("returns 200 and status=connected when reconnecting a disconnected device", async () => {
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      db.prepare(
        "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', 'active')",
      ).run(USER_ID, "alice@example.com");

      const app = await buildApp();

      // Connect then disconnect
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "connect" });
      await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "disconnect" });

      // Reconnect
      const res = await supertest(app)
        .put("/api/v1/devices/connections")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ deviceType: "smart_scale", action: "reconnect" });

      expect(res.status).toBe(200);
      expect(res.body.data.device.status).toBe("connected");
    });
  });
});

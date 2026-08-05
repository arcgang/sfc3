// Acceptance tests for: Synchronize device data into the unified health record
//
// Covers the seam between all four tasks — pairing, sync ingestion, dashboard,
// and frontend status display — that existing unit tests do not exercise together.
//
// Each describe block names the criterion it proves.

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
const TEST_JWT_SECRET = "test-jwt-secret-acceptance";
// Far-future constant — avoids hardcoded wall-clock timestamps in fixtures.
const FIXTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "sync-acceptance-"));
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

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId, email: `${userId}@example.com` }, TEST_JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function buildFullApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { devicesRouter } = await import("./devices.js");
  const { dashboardRouter } = await import("../api/dashboardRoutes.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/devices", authMiddleware(TEST_JWT_SECRET), devicesRouter);
  app.use("/api/v1/dashboard", authMiddleware(TEST_JWT_SECRET), dashboardRouter);
  app.use(errorHandler);
  return { app, dbPath };
}

async function seedUser(dbPath: string, userId: string): Promise<void> {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
  db.close();
}

async function seedConnectedDevice(
  dbPath: string,
  userId: string,
  deviceType: "smartwatch" | "smart_scale",
): Promise<string> {
  const db = new Database(dbPath);
  const id = `conn-${userId}-${deviceType}`;
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, device_name, provider, connection_status,
        connected_since, created_at, updated_at)
     VALUES (?, ?, ?, 'Test Device', 'TestProvider', 'connected', ?, ?, ?)`,
  ).run(id, userId, deviceType, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
  db.close();
  return id;
}

// ---------------------------------------------------------------------------
// Criterion 1 — Pairing → Sync writes health_records with all required columns
// ---------------------------------------------------------------------------

describe("C1 — pairing then Sync Now writes health_records with source_type, device_connection_id, measurement_session_id, source_payload_hash", () => {
  it("precondition: measurement_session_id and source_payload_hash columns exist on health_records after migrations", async () => {
    const { app: _app, dbPath } = await buildFullApp();
    const db = new Database(dbPath);
    const sessionIdCol = db
      .prepare("SELECT name FROM pragma_table_info('health_records') WHERE name = 'measurement_session_id'")
      .get() as { name: string } | undefined;
    const hashCol = db
      .prepare("SELECT name FROM pragma_table_info('health_records') WHERE name = 'source_payload_hash'")
      .get() as { name: string } | undefined;
    db.close();
    expect(sessionIdCol, "measurement_session_id column must exist (migration 002)").toBeDefined();
    expect(hashCol, "source_payload_hash column must exist (migration 002)").toBeDefined();
  });

  it("all four required columns are populated on health_records rows after pairing and sync", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c1-user-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Pair device (pairing task)
    const pairRes = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit", deviceName: "Fitbit Charge 6" });
    expect(pairRes.status).toBe(200);
    const connectionId = (pairRes.body as { data: { device: { id: string } } }).data.device.id;

    // Trigger sync (sync ingestion task)
    const syncRes = await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(syncRes.status).toBe(200);

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        `SELECT source_type, device_connection_id, measurement_session_id, source_payload_hash
           FROM health_records WHERE device_connection_id = ?`,
      )
      .all(connectionId) as {
        source_type: string;
        device_connection_id: string;
        measurement_session_id: string | null;
        source_payload_hash: string | null;
      }[];
    db.close();

    expect(rows.length, "at least one health_record row must be written after sync").toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source_type).toBe("smartwatch");
      expect(row.device_connection_id).toBe(connectionId);
      expect(row.measurement_session_id, "measurement_session_id must be non-null").not.toBeNull();
      expect(row.source_payload_hash, "source_payload_hash must be non-null").not.toBeNull();
    }
  });

  it("health_records for a smart_scale sync carry source_type = 'smart_scale' and all required columns", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c1-user-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const pairRes = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect", provider: "Withings" });
    expect(pairRes.status).toBe(200);
    const connectionId = (pairRes.body as { data: { device: { id: string } } }).data.device.id;

    const syncRes = await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(syncRes.status).toBe(200);

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        `SELECT source_type, measurement_session_id, source_payload_hash
           FROM health_records WHERE device_connection_id = ?`,
      )
      .all(connectionId) as {
        source_type: string;
        measurement_session_id: string | null;
        source_payload_hash: string | null;
      }[];
    db.close();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source_type).toBe("smart_scale");
      expect(row.measurement_session_id).not.toBeNull();
      expect(row.source_payload_hash).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — Dashboard combines data from all connected device types
// ---------------------------------------------------------------------------

describe("C2 — GET /api/v1/dashboard returns a single payload combining all device types", () => {
  it("both smartwatch and smart_scale metrics appear in one dashboard response after both devices are synced", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c2-user-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Pair both device types
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Garmin" });
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect", provider: "Withings" });

    const listRes = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const devices = (listRes.body as { data: { devices: Array<{ id: string; deviceType: string }> } }).data.devices;
    const swConn = devices.find((d) => d.deviceType === "smartwatch");
    const ssConn = devices.find((d) => d.deviceType === "smart_scale");
    expect(swConn, "smartwatch connection must be present after pairing").toBeDefined();
    expect(ssConn, "smart_scale connection must be present after pairing").toBeDefined();

    // Sync both devices
    expect(
      (await supertest(app)
        .post(`/api/v1/devices/${swConn!.id}/sync`)
        .set("Authorization", `Bearer ${token}`)
        .send({})).status,
    ).toBe(200);
    expect(
      (await supertest(app)
        .post(`/api/v1/devices/${ssConn!.id}/sync`)
        .set("Authorization", `Bearer ${token}`)
        .send({})).status,
    ).toBe(200);

    // Dashboard must combine both devices in a single payload
    const dashRes = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);

    const body = dashRes.body as {
      data: {
        devices: Array<{ deviceType: string }>;
        smartwatch: Record<string, unknown> | null;
        smartScale: Record<string, unknown> | null;
      };
    };

    const deviceTypes = body.data.devices.map((d) => d.deviceType).sort();
    expect(deviceTypes).toContain("smartwatch");
    expect(deviceTypes).toContain("smart_scale");
    expect(body.data.smartwatch, "smartwatch metrics must be non-null after smartwatch sync").not.toBeNull();
    expect(body.data.smartScale, "smartScale metrics must be non-null after smart_scale sync").not.toBeNull();
  });

  it("dashboard devices array contains an entry for each paired device type regardless of sync status", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c2-user-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Apple" });
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect", provider: "Withings" });

    const dashRes = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);

    const body = dashRes.body as { data: { devices: Array<{ deviceType: string }> } };
    expect(body.data.devices.length).toBe(2);
    const types = body.data.devices.map((d) => d.deviceType).sort();
    expect(types).toEqual(["smart_scale", "smartwatch"]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — last_successful_sync_at updated only on success
// ---------------------------------------------------------------------------

describe("C3 — last_successful_sync_at updated only on successful sync", () => {
  it("last_successful_sync_at is set after a successful sync and was null before", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c3-user-1";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    const dbBefore = new Database(dbPath);
    const before = dbBefore
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connectionId) as { last_successful_sync_at: string | null };
    dbBefore.close();
    expect(before.last_successful_sync_at, "must be null before any sync").toBeNull();

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const dbAfter = new Database(dbPath);
    const after = dbAfter
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connectionId) as { last_successful_sync_at: string | null };
    dbAfter.close();
    expect(after.last_successful_sync_at, "must be set after successful sync").not.toBeNull();
  });

  it("last_successful_sync_at remains null when the provider fails", async () => {
    const dbPath = join(ctx.tmpDir, "c3-fail.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = "c3-user-2";
    const connId = "c3-conn-2";
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')")
      .run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Test', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, "smartwatch", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    const { SyncService } = await import("../services/SyncService.js");
    const svc = new SyncService(db, () => ({
      fetchData: async (): Promise<never> => { throw new Error("Provider down"); },
    }));

    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "c3-corr-2",
    });

    const row = db
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connId) as { last_successful_sync_at: string | null };
    expect(row.last_successful_sync_at, "must remain null after a failed sync").toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — sync_runs row created for every attempt with correct status
// ---------------------------------------------------------------------------

describe("C4 — sync_runs row created for every sync attempt recording the right sync_status", () => {
  it("sync_run has sync_status = 'succeeded' after a successful smartwatch sync", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c4-user-1";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ?")
      .all(connectionId) as { sync_status: string }[];
    db.close();
    expect(rows.length).toBe(1);
    expect(rows[0]?.sync_status).toBe("succeeded");
  });

  it("sync_run has sync_status = 'failed' when the provider call throws", async () => {
    const dbPath = join(ctx.tmpDir, "c4-fail.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = "c4-user-2";
    const connId = "c4-conn-2";
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')")
      .run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Test', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, "smartwatch", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    const { SyncService } = await import("../services/SyncService.js");
    await new SyncService(db, () => ({
      fetchData: async (): Promise<never> => { throw new Error("Provider down"); },
    })).sync({ deviceConnectionId: connId, userId, deviceType: "smartwatch", syncWindowHours: 24, correlationId: "c4-corr-2" });

    const rows = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ?")
      .all(connId) as { sync_status: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.sync_status).toBe("failed");
  });

  it("sync_run has sync_status = 'partial_discard' for a smart_scale with only incomplete sessions", async () => {
    const dbPath = join(ctx.tmpDir, "c4-partial.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = "c4-user-3";
    const connId = "c4-conn-3";
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')")
      .run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Scale', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, "smart_scale", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    const { SyncService } = await import("../services/SyncService.js");
    await new SyncService(db, () => ({
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [{ sessionId: "inc-s", recordedAt: FIXTURE_TIMESTAMP, weightKg: 80.0 }],
      }),
    })).sync({ deviceConnectionId: connId, userId, deviceType: "smart_scale", syncWindowHours: 24, correlationId: "c4-corr-3" });

    const rows = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ?")
      .all(connId) as { sync_status: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.sync_status).toBe("partial_discard");
  });

  it("a sync_run row is created even for the very first sync after pairing", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c4-user-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const pairRes = await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smartwatch", action: "connect", provider: "Fitbit" });
    const connectionId = (pairRes.body as { data: { device: { id: string } } }).data.device.id;

    const db = new Database(dbPath);
    const before = db
      .prepare("SELECT COUNT(*) AS cnt FROM sync_runs WHERE device_connection_id = ?")
      .get(connectionId) as { cnt: number };
    expect(before.cnt, "no sync_runs before first sync").toBe(0);
    db.close();

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const dbAfter = new Database(dbPath);
    const after = dbAfter
      .prepare("SELECT COUNT(*) AS cnt FROM sync_runs WHERE device_connection_id = ?")
      .get(connectionId) as { cnt: number };
    dbAfter.close();
    expect(after.cnt, "one sync_run must exist after the first sync").toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — Provider failure: existing health_records untouched; 502 returned
// ---------------------------------------------------------------------------

describe("C5 — provider failure leaves existing health_records untouched and returns a clear error", () => {
  it("prior health_records are not modified when a subsequent sync attempt fails", async () => {
    const dbPath = join(ctx.tmpDir, "c5-records.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = "c5-user-1";
    const connId = "c5-conn-1";
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')")
      .run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Test', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, "smartwatch", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    const { SyncService } = await import("../services/SyncService.js");

    // First sync succeeds and writes records
    await new SyncService(db).sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "c5-corr-1a",
    });

    const countBefore = (
      db.prepare("SELECT COUNT(*) AS cnt FROM health_records WHERE device_connection_id = ?")
        .get(connId) as { cnt: number }
    ).cnt;
    expect(countBefore, "initial sync must produce at least one health_record").toBeGreaterThan(0);

    // Second sync fails (provider throws)
    const failResult = await new SyncService(db, () => ({
      fetchData: async (): Promise<never> => { throw new Error("Provider unreachable"); },
    })).sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "c5-corr-1b",
    });
    expect(failResult.syncStatus).toBe("failed");

    const countAfter = (
      db.prepare("SELECT COUNT(*) AS cnt FROM health_records WHERE device_connection_id = ?")
        .get(connId) as { cnt: number }
    ).cnt;
    expect(countAfter, "health_record count must be unchanged after a failed sync").toBe(countBefore);
  });

  it("returns HTTP 502 with SYNC_FAILED error type when the sync fails, giving the user a clear status", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c5-user-2";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    // Build an app that always returns a failed sync result
    process.env.DB_PATH = dbPath;
    const { createDevicesRouter } = await import("./devices.js");
    const { authMiddleware } = await import("../middleware/auth.js");
    const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
    const { errorHandler } = await import("../middleware/errorHandler.js");

    class AlwaysFailSyncService {
      async sync(_params: unknown) {
        return {
          syncRunId: "fail-run",
          syncStatus: "failed" as const,
          recordsWritten: 0,
          recordsDiscarded: 0,
          errorMessage: "Provider API unavailable",
        };
      }
    }

    const failApp = express();
    failApp.use(express.json());
    failApp.use(correlationIdMiddleware);
    failApp.use("/api/v1/devices", authMiddleware(TEST_JWT_SECRET), createDevicesRouter(() => new AlwaysFailSyncService()));
    failApp.use(errorHandler);

    const res = await supertest(failApp)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(502);
    const body = res.body as { error: { type: string; details: Array<{ message: string }> } };
    expect(body.error.type).toBe("SYNC_FAILED");
    expect(body.error.details[0]?.message, "error details must contain a human-readable message").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — Smart scale partial sessions discarded; prior data remains visible
// ---------------------------------------------------------------------------

describe("C6 — smart_scale partial sessions discarded; sync_run = partial_discard; prior dashboard data preserved", () => {
  it("partial discard sync marks sync_run as partial_discard while prior weight/composition data remains on the dashboard", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c6-user-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    // Pair smart_scale
    await supertest(app)
      .put("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "smart_scale", action: "connect", provider: "Withings" });

    const listRes = await supertest(app)
      .get("/api/v1/devices/connections")
      .set("Authorization", `Bearer ${token}`);
    const ssConn = (listRes.body as { data: { devices: Array<{ id: string; deviceType: string }> } })
      .data.devices.find((d) => d.deviceType === "smart_scale");
    expect(ssConn, "smart_scale connection must exist after pairing").toBeDefined();
    const ssConnId = ssConn!.id;

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const { SyncService } = await import("../services/SyncService.js");

    // First sync: complete session — writes prior data
    const priorResult = await new SyncService(db, () => ({
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [
          {
            sessionId: "prior-session",
            recordedAt: new Date(Date.now() - 7_200_000).toISOString(),
            weightKg: 74.5,
            bodyFatPct: 19.0,
            muscleMassPct: 41.0,
            boneMassKg: 3.1,
          },
        ],
      }),
    })).sync({
      deviceConnectionId: ssConnId,
      userId,
      deviceType: "smart_scale",
      syncWindowHours: 24,
      correlationId: "c6-corr-1a",
    });
    expect(priorResult.syncStatus).toBe("succeeded");

    // Second sync: incomplete session — missing required body composition fields
    const partialResult = await new SyncService(db, () => ({
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [
          { sessionId: "partial-session", recordedAt: FIXTURE_TIMESTAMP, weightKg: 75.0 },
        ],
      }),
    })).sync({
      deviceConnectionId: ssConnId,
      userId,
      deviceType: "smart_scale",
      syncWindowHours: 24,
      correlationId: "c6-corr-1b",
    });
    expect(partialResult.syncStatus).toBe("partial_discard");
    expect(partialResult.recordsDiscarded).toBe(1);
    expect(partialResult.recordsWritten).toBe(0);

    // sync_run for the partial sync is marked partial_discard
    const syncRuns = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ? ORDER BY started_at ASC")
      .all(ssConnId) as { sync_status: string }[];
    expect(syncRuns.length).toBe(2);
    expect(syncRuns[1]?.sync_status).toBe("partial_discard");

    // Prior data is still returned by the dashboard
    const dashRes = await supertest(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);

    const dash = dashRes.body as {
      data: { smartScale: { weightKg: number; bodyFatPct: number; muscleMassPct: number } | null };
    };
    expect(dash.data.smartScale, "prior smart_scale data must still be visible after partial_discard sync").not.toBeNull();
    expect(dash.data.smartScale?.weightKg).toBe(74.5);
    expect(dash.data.smartScale?.bodyFatPct).toBe(19.0);
    expect(dash.data.smartScale?.muscleMassPct).toBe(41.0);
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — Console logs emitted per HLD log taxonomy
// ---------------------------------------------------------------------------

describe("C7 — device.sync_started and device.sync_failed console logs emitted", () => {
  it("device.sync_started log contains event, deviceConnectionId, userId, deviceType, correlationId", async () => {
    const { app, dbPath } = await buildFullApp();
    const userId = "c7-user-1";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const startedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.sync_started",
    );
    expect(startedLog, "device.sync_started must be logged").toBeDefined();
    const logObj = startedLog![0] as Record<string, unknown>;
    expect(logObj["deviceConnectionId"]).toBe(connectionId);
    expect(logObj["userId"]).toBe(userId);
    expect(logObj["deviceType"]).toBe("smartwatch");
    expect(typeof logObj["correlationId"]).toBe("string");
  });

  it("device.sync_failed log is emitted when the provider throws, containing deviceConnectionId and errorMessage", async () => {
    const dbPath = join(ctx.tmpDir, "c7-fail.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = "c7-user-2";
    const connId = "c7-conn-2";
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')")
      .run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Test', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, "smartwatch", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    const { SyncService } = await import("../services/SyncService.js");
    await new SyncService(db, () => ({
      fetchData: async (): Promise<never> => { throw new Error("Simulated failure"); },
    })).sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "c7-corr-2",
    });

    const failLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.sync_failed",
    );
    expect(failLog, "device.sync_failed must be logged on provider failure").toBeDefined();
    const logObj = failLog![0] as Record<string, unknown>;
    expect(logObj["deviceConnectionId"]).toBe(connId);
    expect(logObj["userId"]).toBe(userId);
    expect(logObj["errorMessage"]).toBe("Simulated failure");
  });

  it("device.sync_started is emitted even when the sync ultimately fails", async () => {
    const dbPath = join(ctx.tmpDir, "c7-both.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = "c7-user-3";
    const connId = "c7-conn-3";
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')")
      .run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Test', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, "smartwatch", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    const { SyncService } = await import("../services/SyncService.js");
    await new SyncService(db, () => ({
      fetchData: async (): Promise<never> => { throw new Error("down"); },
    })).sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "c7-corr-3",
    });

    const startedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.sync_started",
    );
    const failedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.sync_failed",
    );
    expect(startedLog, "device.sync_started must appear before device.sync_failed").toBeDefined();
    expect(failedLog, "device.sync_failed must appear after device.sync_started").toBeDefined();
  });
});

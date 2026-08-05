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
const TEST_JWT_SECRET = "test-jwt-secret-sync";

// Far-future constant for fixture timestamps — avoids absolute wall-clock dates.
const FIXTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "sync-test-"));
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

/**
 * Build a fresh DB + migrate + seed user + device connection.
 * Returns { db, connectionId, token } for direct unit testing.
 */
async function buildTestDb(
  dbPath: string,
  userId: string,
  deviceType: "smartwatch" | "smart_scale",
): Promise<{ db: Database.Database; connectionId: string; token: string }> {
  process.env.DB_PATH = dbPath;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { getDatabase } = await import("../db/connection.js");
  const db = getDatabase();

  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");

  const connectionId = `conn-${userId}-${deviceType}`;
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, device_name, provider, connection_status,
        connected_since, created_at, updated_at)
     VALUES (?, ?, ?, 'Test Device', 'TestProvider', 'connected', ?, ?, ?)`,
  ).run(connectionId, userId, deviceType, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

  const token = jwt.sign(
    { sub: userId, email: `${userId}@example.com` },
    TEST_JWT_SECRET,
    { expiresIn: "1h" },
  );
  return { db, connectionId, token };
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
// Authentication
// ---------------------------------------------------------------------------

describe("POST /api/v1/devices/:id/sync — authentication", () => {
  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/devices/some-conn-id/sync")
      .send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Not-found / authorization
// ---------------------------------------------------------------------------

describe("POST /api/v1/devices/:id/sync — not found / authorization", () => {
  it("returns 404 when the device connection does not exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-404-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/devices/nonexistent-id/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 403 when the device connection belongs to a different user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");

    const ownerUserId = "owner-forbid-1";
    const attackerUserId = "attacker-forbid-1";
    await seedUser(dbPath, ownerUserId);
    await seedUser(dbPath, attackerUserId);

    const connectionId = await seedConnectedDevice(dbPath, ownerUserId, "smartwatch");
    const attackerToken = makeToken(attackerUserId);

    const res = await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({});

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Successful smartwatch sync — HTTP integration tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/devices/:id/sync — successful smartwatch sync", () => {
  it("returns 200 on a successful smartwatch sync", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-1";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    const res = await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
  });

  it("returns syncStatus = 'succeeded' in the response body", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-2";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    const res = await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const body = res.body as { data: { syncStatus: string } };
    expect(body.data.syncStatus).toBe("succeeded");
  });

  it("inserts health_records rows after a successful smartwatch sync", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-3";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare("SELECT id FROM health_records WHERE device_connection_id = ?")
      .all(connectionId) as { id: string }[];
    db.close();

    expect(rows.length).toBeGreaterThan(0);
  });

  it("stores source_type = 'smartwatch' on health_records", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-4";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT DISTINCT source_type FROM health_records WHERE device_connection_id = ?",
      )
      .all(connectionId) as { source_type: string }[];
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0]?.source_type).toBe("smartwatch");
  });

  it("stores device_connection_id on health_records matching the connection id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-5";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT device_connection_id FROM health_records WHERE device_connection_id = ?",
      )
      .all(connectionId) as { device_connection_id: string }[];
    db.close();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.device_connection_id).toBe(connectionId);
  });

  it("stores measurement_session_id (non-null) on all health_records", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-6";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT measurement_session_id FROM health_records WHERE device_connection_id = ?",
      )
      .all(connectionId) as { measurement_session_id: string | null }[];
    db.close();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.measurement_session_id).not.toBeNull();
    }
  });

  it("stores source_payload_hash (non-null) on all health_records", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-7";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT source_payload_hash FROM health_records WHERE device_connection_id = ?",
      )
      .all(connectionId) as { source_payload_hash: string | null }[];
    db.close();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source_payload_hash).not.toBeNull();
    }
  });

  it("updates device_connections.last_successful_sync_at on success", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-8";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    const dbBefore = new Database(dbPath);
    const before = dbBefore
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connectionId) as { last_successful_sync_at: string | null };
    dbBefore.close();
    expect(before.last_successful_sync_at).toBeNull();

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const dbAfter = new Database(dbPath);
    const after = dbAfter
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connectionId) as { last_successful_sync_at: string | null };
    dbAfter.close();

    expect(after.last_successful_sync_at).not.toBeNull();
  });

  it("creates a sync_runs row for the attempt with sync_status = 'succeeded'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-9";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const db = new Database(dbPath);
    const rows = db
      .prepare(
        "SELECT sync_status FROM sync_runs WHERE device_connection_id = ?",
      )
      .all(connectionId) as { sync_status: string }[];
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0]?.sync_status).toBe("succeeded");
  });

  it("emits a device.sync_started console log event", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-10";
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
    expect(startedLog).toBeDefined();
  });

  it("returns recordsWritten > 0 on successful sync", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-sw-sync-11";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    const res = await supertest(app)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const body = res.body as { data: { recordsWritten: number } };
    expect(body.data.recordsWritten).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SyncService unit tests — provider failure path (direct, no module mocking)
// ---------------------------------------------------------------------------

describe("SyncService — provider failure (direct unit test)", () => {
  async function buildSyncServiceDb(suffix: string) {
    const dbPath = join(ctx.tmpDir, `${suffix}.db`);
    // After beforeEach vi.resetModules(), all module imports are fresh.
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    return db;
  }

  function seedDb(
    db: Database.Database,
    userId: string,
    connId: string,
    deviceType: "smartwatch" | "smart_scale",
  ) {
    db.prepare(
      "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
    ).run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Test', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, deviceType, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
  }

  it("creates a sync_runs row with sync_status = 'failed' when the provider throws", async () => {
    const db = await buildSyncServiceDb("provider-fail-1");
    const userId = "pf-user-1";
    const connId = "pf-conn-1";
    seedDb(db, userId, connId, "smartwatch");

    const { SyncService } = await import("../services/SyncService.js");
    const failingProvider = {
      fetchData: async (): Promise<never> => {
        throw new Error("Simulated provider failure");
      },
    };
    const svc = new SyncService(db, () => failingProvider);

    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "pf-corr-1",
    });

    const rows = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ?")
      .all(connId) as { sync_status: string }[];

    expect(rows.length).toBe(1);
    expect(rows[0]?.sync_status).toBe("failed");
  });

  it("does not write health_records when the provider throws", async () => {
    const db = await buildSyncServiceDb("provider-fail-2");
    const userId = "pf-user-2";
    const connId = "pf-conn-2";
    seedDb(db, userId, connId, "smartwatch");

    const { SyncService } = await import("../services/SyncService.js");
    const failingProvider = {
      fetchData: async (): Promise<never> => { throw new Error("Provider down"); },
    };
    const svc = new SyncService(db, () => failingProvider);

    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "pf-corr-2",
    });

    const rows = db
      .prepare("SELECT id FROM health_records WHERE device_connection_id = ?")
      .all(connId) as { id: string }[];

    expect(rows.length).toBe(0);
  });

  it("does not update last_successful_sync_at when the provider throws", async () => {
    const db = await buildSyncServiceDb("provider-fail-3");
    const userId = "pf-user-3";
    const connId = "pf-conn-3";
    seedDb(db, userId, connId, "smartwatch");

    const { SyncService } = await import("../services/SyncService.js");
    const failingProvider = {
      fetchData: async (): Promise<never> => { throw new Error("down"); },
    };
    const svc = new SyncService(db, () => failingProvider);

    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "pf-corr-3",
    });

    const row = db
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connId) as { last_successful_sync_at: string | null };

    expect(row.last_successful_sync_at).toBeNull();
  });

  it("emits device.sync_failed event when provider throws", async () => {
    const db = await buildSyncServiceDb("provider-fail-4");
    const userId = "pf-user-4";
    const connId = "pf-conn-4";
    seedDb(db, userId, connId, "smartwatch");

    const { SyncService } = await import("../services/SyncService.js");
    const failingProvider = {
      fetchData: async (): Promise<never> => { throw new Error("down"); },
    };
    const svc = new SyncService(db, () => failingProvider);

    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "pf-corr-4",
    });

    const failLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.sync_failed",
    );
    expect(failLog).toBeDefined();
  });

  it("returns syncStatus = 'failed' when provider throws", async () => {
    const db = await buildSyncServiceDb("provider-fail-5");
    const userId = "pf-user-5";
    const connId = "pf-conn-5";
    seedDb(db, userId, connId, "smartwatch");

    const { SyncService } = await import("../services/SyncService.js");
    const failingProvider = {
      fetchData: async (): Promise<never> => { throw new Error("down"); },
    };
    const svc = new SyncService(db, () => failingProvider);

    const result = await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smartwatch",
      syncWindowHours: 24,
      correlationId: "pf-corr-5",
    });

    expect(result.syncStatus).toBe("failed");
    expect(result.errorMessage).toBe("down");
  });
});

// ---------------------------------------------------------------------------
// SyncService unit tests — provider failure returns 502 via HTTP route
// ---------------------------------------------------------------------------

describe("POST /api/v1/devices/:id/sync — provider failure returns 502", () => {
  it("returns 502 when SyncService returns syncStatus = 'failed'", async () => {
    const dbPath = join(ctx.tmpDir, "test.db");
    process.env.DB_PATH = dbPath;
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const userId = "user-http-fail-1";
    await seedUser(dbPath, userId);
    const connectionId = await seedConnectedDevice(dbPath, userId, "smartwatch");
    const token = makeToken(userId);

    // Inject a factory that always returns a failing sync service — no module mocking needed.
    const { createDevicesRouter } = await import("./devices.js");
    const { authMiddleware } = await import("../middleware/auth.js");
    const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
    const { errorHandler } = await import("../middleware/errorHandler.js");

    class FailingSyncService {
      async sync(_params: unknown) {
        return {
          syncRunId: "mock-run-fail",
          syncStatus: "failed" as const,
          recordsWritten: 0,
          recordsDiscarded: 0,
          errorMessage: "Provider API unavailable",
        };
      }
    }

    const failRouter = createDevicesRouter(() => new FailingSyncService());

    const failApp = express();
    failApp.use(express.json());
    failApp.use(correlationIdMiddleware);
    failApp.use("/api/v1/devices", authMiddleware(TEST_JWT_SECRET), failRouter);
    failApp.use(errorHandler);

    const res = await supertest(failApp)
      .post(`/api/v1/devices/${connectionId}/sync`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(502);
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("SYNC_FAILED");
  });
});

// ---------------------------------------------------------------------------
// SyncService unit tests — smart_scale partial discard
// ---------------------------------------------------------------------------

describe("SyncService — smart_scale partial_discard", () => {
  async function buildSyncServiceDb(suffix: string, deviceType: "smartwatch" | "smart_scale") {
    const dbPath = join(ctx.tmpDir, `${suffix}.db`);
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const userId = `scale-user-${suffix}`;
    const connId = `scale-conn-${suffix}`;
    db.prepare(
      "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
    ).run(userId, `${userId}@example.com`, "hashed");
    db.prepare(
      `INSERT INTO device_connections
         (id, user_id, device_type, device_name, provider, connection_status,
          connected_since, created_at, updated_at)
       VALUES (?, ?, ?, 'Scale', 'Prov', 'connected', ?, ?, ?)`,
    ).run(connId, userId, deviceType, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);

    return { db, userId, connId };
  }

  it("discards sessions missing required body composition fields and marks sync_run as partial_discard", async () => {
    const { db, userId, connId } = await buildSyncServiceDb("partial-1", "smart_scale");

    const { SyncService } = await import("../services/SyncService.js");

    // Session missing bodyFatPct, muscleMassPct, boneMassKg
    const incompleteProvider = {
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [
          {
            sessionId: "inc-session-1",
            recordedAt: FIXTURE_TIMESTAMP,
            weightKg: 75.0,
            // missing required body composition fields
          },
        ],
      }),
    };

    const svc = new SyncService(db, () => incompleteProvider);
    const result = await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smart_scale",
      syncWindowHours: 24,
      correlationId: "partial-corr-1",
    });

    expect(result.syncStatus).toBe("partial_discard");
    expect(result.recordsDiscarded).toBe(1);
    expect(result.recordsWritten).toBe(0);

    const rows = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ?")
      .all(connId) as { sync_status: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.sync_status).toBe("partial_discard");
  });

  it("inserts no health_records for a fully-discarded smart_scale sync", async () => {
    const { db, userId, connId } = await buildSyncServiceDb("partial-2", "smart_scale");

    const { SyncService } = await import("../services/SyncService.js");
    const incompleteProvider = {
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [{ sessionId: "inc-s2", recordedAt: FIXTURE_TIMESTAMP, weightKg: 80.0 }],
      }),
    };

    const svc = new SyncService(db, () => incompleteProvider);
    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smart_scale",
      syncWindowHours: 24,
      correlationId: "partial-corr-2",
    });

    const rows = db
      .prepare("SELECT id FROM health_records WHERE device_connection_id = ?")
      .all(connId) as { id: string }[];

    expect(rows.length).toBe(0);
  });

  it("still updates last_successful_sync_at on partial_discard", async () => {
    const { db, userId, connId } = await buildSyncServiceDb("partial-3", "smart_scale");

    const { SyncService } = await import("../services/SyncService.js");
    const incompleteProvider = {
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [{ sessionId: "inc-3", recordedAt: FIXTURE_TIMESTAMP, weightKg: 70.0 }],
      }),
    };

    const svc = new SyncService(db, () => incompleteProvider);
    await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smart_scale",
      syncWindowHours: 24,
      correlationId: "partial-corr-3",
    });

    const row = db
      .prepare("SELECT last_successful_sync_at FROM device_connections WHERE id = ?")
      .get(connId) as { last_successful_sync_at: string | null };

    expect(row.last_successful_sync_at).not.toBeNull();
  });

  it("accepts a complete smart_scale session and marks sync_run as succeeded", async () => {
    const { db, userId, connId } = await buildSyncServiceDb("partial-4", "smart_scale");

    const { SyncService } = await import("../services/SyncService.js");
    const completeProvider = {
      fetchData: async () => ({
        deviceType: "smart_scale" as const,
        sessions: [
          {
            sessionId: "complete-s4",
            recordedAt: FIXTURE_TIMESTAMP,
            weightKg: 75.0,
            bodyFatPct: 18.5,
            muscleMassPct: 42.0,
            boneMassKg: 3.1,
          },
        ],
      }),
    };

    const svc = new SyncService(db, () => completeProvider);
    const result = await svc.sync({
      deviceConnectionId: connId,
      userId,
      deviceType: "smart_scale",
      syncWindowHours: 24,
      correlationId: "partial-corr-4",
    });

    expect(result.syncStatus).toBe("succeeded");
    expect(result.recordsDiscarded).toBe(0);
    expect(result.recordsWritten).toBeGreaterThan(0);

    const rows = db
      .prepare("SELECT sync_status FROM sync_runs WHERE device_connection_id = ?")
      .all(connId) as { sync_status: string }[];
    expect(rows[0]?.sync_status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// sync_runs created for every attempt (HTTP integration)
// ---------------------------------------------------------------------------

describe("sync_runs row created for every sync attempt", () => {
  it("creates a sync_runs row on successful smartwatch sync", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "run-http-1";
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
});

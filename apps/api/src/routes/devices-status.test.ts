import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "devices-status-test-"));
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
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { createDevicesRouter } = await import("./devices.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  // intentionally no auth middleware — GET / and action routes are public in MVP
  app.use("/api/v1/devices", createDevicesRouter());
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/v1/devices — seed data
// ---------------------------------------------------------------------------

describe("GET /api/v1/devices — seeded devices", () => {
  it("returns 200", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/devices");
    expect(res.status).toBe(200);
  });

  it("returns all three seeded devices on first startup", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as { data: { devices: unknown[] } };
    expect(body.data.devices.length).toBe(3);
  });

  it("seeds Fitbit Charge 5 as a smartwatch", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as {
      data: { devices: Array<{ deviceName: string; deviceType: string }> };
    };
    const fitbit = body.data.devices.find((d) => d.deviceName === "Fitbit Charge 5");
    expect(fitbit).toBeDefined();
    expect(fitbit?.deviceType).toBe("smartwatch");
  });

  it("seeds Withings Body+ as a smart_scale", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as {
      data: { devices: Array<{ deviceName: string; deviceType: string }> };
    };
    const withings = body.data.devices.find((d) => d.deviceName === "Withings Body+");
    expect(withings).toBeDefined();
    expect(withings?.deviceType).toBe("smart_scale");
  });

  it("seeds Apple Watch Series 8 as a smartwatch", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as {
      data: { devices: Array<{ deviceName: string; deviceType: string }> };
    };
    const apple = body.data.devices.find((d) => d.deviceName === "Apple Watch Series 8");
    expect(apple).toBeDefined();
    expect(apple?.deviceType).toBe("smartwatch");
  });

  it("does not seed again when devices already exist", async () => {
    const app = await buildApp();
    // First call seeds
    await supertest(app).get("/api/v1/devices");
    // Second call should not duplicate
    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as { data: { devices: unknown[] } };
    expect(body.data.devices.length).toBe(3);
  });

  it("each seeded device has a non-null lastSyncAt", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as {
      data: { devices: Array<{ lastSyncAt: unknown }> };
    };
    for (const device of body.data.devices) {
      expect(device.lastSyncAt).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/devices/:id/reconnect
// ---------------------------------------------------------------------------

describe("POST /api/v1/devices/:id/reconnect", () => {
  it("returns 200 for a known device", async () => {
    const app = await buildApp();
    // Trigger seeding
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM device_connections LIMIT 1")
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("no seeded device found");

    const res = await supertest(app).post(`/api/v1/devices/${row.id}/reconnect`);
    expect(res.status).toBe(200);
  });

  it("sets connection_status to connected after reconnect", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM device_connections WHERE device_name = 'Apple Watch Series 8'")
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("Apple Watch seed device not found");

    const res = await supertest(app).post(`/api/v1/devices/${row.id}/reconnect`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("connected");
  });

  it("refreshes last_sync_at after reconnect", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT id, last_sync_at FROM device_connections WHERE device_name = 'Withings Body+'",
      )
      .get() as { id: string; last_sync_at: string } | undefined;
    db.close();
    if (!row) throw new Error("Withings seed device not found");

    const before = row.last_sync_at;
    const res = await supertest(app).post(`/api/v1/devices/${row.id}/reconnect`);
    const body = res.body as { data: { device: { lastSyncAt: string } } };
    expect(body.data.device.lastSyncAt).not.toBe(before);
  });

  it("returns 404 for an unknown device id", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/devices/nonexistent-id/reconnect");
    expect(res.status).toBe(404);
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("NOT_FOUND");
  });

  it("emits device.reconnected log event", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM device_connections LIMIT 1")
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("no seeded device");

    await supertest(app).post(`/api/v1/devices/${row.id}/reconnect`);

    const reconnectedLog = ctx.consoleSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "device.reconnected",
    );
    expect(reconnectedLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/devices/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/devices/:id", () => {
  it("returns 204 when device exists", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM device_connections LIMIT 1")
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("no seeded device");

    const res = await supertest(app).delete(`/api/v1/devices/${row.id}`);
    expect(res.status).toBe(204);
  });

  it("removes the device row from the database", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT id FROM device_connections WHERE device_name = 'Fitbit Charge 5'",
      )
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("Fitbit seed device not found");

    await supertest(app).delete(`/api/v1/devices/${row.id}`);

    const db2 = new Database(dbPath);
    const gone = db2
      .prepare("SELECT id FROM device_connections WHERE id = ?")
      .get(row.id) as { id: string } | undefined;
    db2.close();
    expect(gone).toBeUndefined();
  });

  it("returns 404 for an unknown device id", async () => {
    const app = await buildApp();
    const res = await supertest(app).delete("/api/v1/devices/nonexistent-id");
    expect(res.status).toBe(404);
    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("NOT_FOUND");
  });

  it("GET returns two devices after one is deleted", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM device_connections LIMIT 1")
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("no seeded device");

    await supertest(app).delete(`/api/v1/devices/${row.id}`);

    const res = await supertest(app).get("/api/v1/devices");
    const body = res.body as { data: { devices: unknown[] } };
    expect(body.data.devices.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/devices/:id/sync — simulated immediate sync (updateSyncNow path)
// The real /:id/sync endpoint requires auth; this tests the updateSyncNow DAO
// behaviour via the reconnect route which uses the same underlying method.
// ---------------------------------------------------------------------------

describe("POST /api/v1/devices/:id/sync — updateSyncNow behaviour", () => {
  it("updateSyncNow sets connection_status to connected in the database", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);

    // Apple Watch is in 'error' state — use reconnect (which calls updateSyncNow) to simulate sync
    const row = db
      .prepare(
        "SELECT id FROM device_connections WHERE device_name = 'Apple Watch Series 8'",
      )
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("Apple Watch seed device not found");

    const res = await supertest(app).post(`/api/v1/devices/${row.id}/reconnect`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { device: { status: string } } };
    expect(body.data.device.status).toBe("connected");

    const db2 = new Database(dbPath);
    const updated = db2
      .prepare("SELECT connection_status, last_sync_at FROM device_connections WHERE id = ?")
      .get(row.id) as { connection_status: string; last_sync_at: string } | undefined;
    db2.close();

    expect(updated?.connection_status).toBe("connected");
    expect(typeof updated?.last_sync_at).toBe("string");
  });

  it("last_sync_at is updated to a recent ISO timestamp after sync", async () => {
    const app = await buildApp();
    await supertest(app).get("/api/v1/devices");

    const dbPath = join(ctx.tmpDir, "test.db");
    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT id FROM device_connections WHERE device_name = 'Fitbit Charge 5'",
      )
      .get() as { id: string } | undefined;
    db.close();
    if (!row) throw new Error("Fitbit seed device not found");

    const beforeMs = Date.now();
    const res = await supertest(app).post(`/api/v1/devices/${row.id}/reconnect`);
    const body = res.body as { data: { device: { lastSyncAt: string } } };
    const syncedAt = new Date(body.data.device.lastSyncAt).getTime();
    expect(syncedAt).toBeGreaterThanOrEqual(beforeMs);
  });
});

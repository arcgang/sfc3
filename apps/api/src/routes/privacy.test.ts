import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const TEST_JWT_SECRET = "test-jwt-secret-routes-privacy";

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "routes-privacy-test-"));
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

  const { privacyRouter } = await import("./privacy.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/privacy", authMiddleware(TEST_JWT_SECRET), privacyRouter);
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
    "INSERT INTO users (id, email, password_hash, full_name, account_status) VALUES (?, ?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed", "Test User");
  db.close();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── POST /api/v1/privacy/requests ────────────────────────────────────────────

describe("POST /api/v1/privacy/requests — unauthenticated → 401", () => {
  it("returns 401 when no token is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .send({ requestType: "export" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/privacy/requests — validation → 422", () => {
  it("returns 422 when requestType is missing", async () => {
    const app = await buildApp();
    const userId = "user-priv-val-1";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({});

    expect(res.status).toBe(422);
    expect((res.body as { error: { type: string } }).error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns 422 when requestType is an unsupported value", async () => {
    const app = await buildApp();
    const userId = "user-priv-val-2";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "transfer" });

    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/privacy/requests — export request → 201 correct fields", () => {
  it("returns 201 for a valid export request", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-1";
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    expect(res.status).toBe(201);
  });

  it("returns data.requestId as a UUID", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-2";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    expect((res.body as { data: { requestId: string } }).data.requestId).toMatch(UUID_RE);
  });

  it("returns data.requestType equal to 'export'", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-3";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    expect((res.body as { data: { requestType: string } }).data.requestType).toBe("export");
  });

  it("returns data.requestStatus equal to 'requested'", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-4";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    expect((res.body as { data: { requestStatus: string } }).data.requestStatus).toBe("requested");
  });

  it("returns a non-empty confirmation message for export", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-5";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    const message = (res.body as { data: { message: string } }).data.message;
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });

  it("persists a privacy_requests row with request_type='export' and request_status='requested'", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-6";
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    const requestId = (res.body as { data: { requestId: string } }).data.requestId;
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT user_id, request_type, request_status FROM privacy_requests WHERE id = ?")
      .get(requestId) as { user_id: string; request_type: string; request_status: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.user_id).toBe(userId);
    expect(row?.request_type).toBe("export");
    expect(row?.request_status).toBe("requested");
  });

  it("stores the caller-supplied requestType in the database, not a hardcoded value", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-7";
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, userId);

    const exportRes = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "export" });

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT request_type FROM privacy_requests WHERE id = ?")
      .get((exportRes.body as { data: { requestId: string } }).data.requestId) as {
      request_type: string;
    } | undefined;
    db.close();

    expect(row?.request_type).toBe("export");
  });

  it("emits privacy.export_requested structured log for export requests", async () => {
    const app = await buildApp();
    const userId = "user-priv-exp-8";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await supertest(app)
        .post("/api/v1/privacy/requests")
        .set("Authorization", `Bearer ${makeToken(userId)}`)
        .send({ requestType: "export" });

      const calls = spy.mock.calls.map((c) => c[0] as Record<string, unknown>);
      const entry = calls.find((c) => c["event"] === "privacy.export_requested");
      expect(entry).toBeDefined();
      expect(entry?.["userId"]).toBe(userId);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("POST /api/v1/privacy/requests — delete request → 201 correct fields", () => {
  it("returns 201 for a valid delete request", async () => {
    const app = await buildApp();
    const userId = "user-priv-del-1";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "delete" });

    expect(res.status).toBe(201);
  });

  it("returns data.requestType equal to 'delete'", async () => {
    const app = await buildApp();
    const userId = "user-priv-del-2";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "delete" });

    expect((res.body as { data: { requestType: string } }).data.requestType).toBe("delete");
  });

  it("persists a privacy_requests row with request_type='delete' and request_status='requested'", async () => {
    const app = await buildApp();
    const userId = "user-priv-del-3";
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "delete" });

    const requestId = (res.body as { data: { requestId: string } }).data.requestId;
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT request_type, request_status FROM privacy_requests WHERE id = ?")
      .get(requestId) as { request_type: string; request_status: string } | undefined;
    db.close();

    expect(row?.request_type).toBe("delete");
    expect(row?.request_status).toBe("requested");
  });

  it("returns a non-empty confirmation message for delete", async () => {
    const app = await buildApp();
    const userId = "user-priv-del-4";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .post("/api/v1/privacy/requests")
      .set("Authorization", `Bearer ${makeToken(userId)}`)
      .send({ requestType: "delete" });

    const message = (res.body as { data: { message: string } }).data.message;
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });

  it("emits privacy.delete_requested structured log for delete requests", async () => {
    const app = await buildApp();
    const userId = "user-priv-del-5";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await supertest(app)
        .post("/api/v1/privacy/requests")
        .set("Authorization", `Bearer ${makeToken(userId)}`)
        .send({ requestType: "delete" });

      const calls = spy.mock.calls.map((c) => c[0] as Record<string, unknown>);
      const entry = calls.find((c) => c["event"] === "privacy.delete_requested");
      expect(entry).toBeDefined();
      expect(entry?.["userId"]).toBe(userId);
    } finally {
      spy.mockRestore();
    }
  });
});

// ── GET /api/v1/privacy/viewed ────────────────────────────────────────────────

describe("GET /api/v1/privacy/viewed — unauthenticated → 401", () => {
  it("returns 401 when no token is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app).get("/api/v1/privacy/viewed");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/privacy/viewed — authenticated → 200 with audit log", () => {
  it("returns 200 for an authenticated request", async () => {
    const app = await buildApp();
    const userId = "user-priv-view-1";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .get("/api/v1/privacy/viewed")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(res.status).toBe(200);
  });

  it("returns data.acknowledged equal to true", async () => {
    const app = await buildApp();
    const userId = "user-priv-view-2";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .get("/api/v1/privacy/viewed")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect((res.body as { data: { acknowledged: boolean } }).data.acknowledged).toBe(true);
  });

  it("emits a privacy.viewed structured log with the authenticated userId", async () => {
    const app = await buildApp();
    const userId = "user-priv-view-3";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await supertest(app)
        .get("/api/v1/privacy/viewed")
        .set("Authorization", `Bearer ${makeToken(userId)}`);

      const calls = spy.mock.calls.map((c) => c[0] as Record<string, unknown>);
      const entry = calls.find((c) => c["event"] === "privacy.viewed");
      expect(entry).toBeDefined();
      expect(entry?.["userId"]).toBe(userId);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns meta.correlationId as a non-empty string", async () => {
    const app = await buildApp();
    const userId = "user-priv-view-4";
    await seedUser(join(ctx.tmpDir, "test.db"), userId);

    const res = await supertest(app)
      .get("/api/v1/privacy/viewed")
      .set("Authorization", `Bearer ${makeToken(userId)}`);

    expect(typeof (res.body as { meta: { correlationId: string } }).meta.correlationId).toBe("string");
    expect((res.body as { meta: { correlationId: string } }).meta.correlationId.length).toBeGreaterThan(0);
  });
});

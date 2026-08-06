import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

const JWT_SECRET = "test-secret-for-profile";

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "routes-profile-test-"));
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
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  vi.restoreAllMocks();
  delete process.env["DB_PATH"];
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env["DB_PATH"] = dbPath;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { profileRouter } = await import("./profile.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/profile", authMiddleware(JWT_SECRET), profileRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "1h" });
}

async function registerUser(userId: string): Promise<void> {
  const { getDatabase } = await import("../db/connection.js");
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, account_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(userId, `user-${userId}@example.com`, "hashed", "Test User", now, now);
}

const USER_ID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// 422 when fullName is missing
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — missing fullName → 422", () => {
  it("returns HTTP 422 when fullName is absent", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateOfBirth: "1990-01-01" });

    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED when fullName is absent", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateOfBirth: "1990-01-01" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });
});

// ---------------------------------------------------------------------------
// 200 on valid minimal payload (fullName only)
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — valid payload → 200", () => {
  it("returns HTTP 200 for a payload with fullName only", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith" });

    expect(res.status).toBe(200);
  });

  it("response data.profile.full_name matches submitted fullName", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith" });

    const body = res.body as { data: { profile: { full_name: string } } };
    expect(body.data.profile.full_name).toBe("Alice Smith");
  });

  it("accepts optional dateOfBirth without error", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith", dateOfBirth: "1990-06-15" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { profile: { date_of_birth: string } } };
    expect(body.data.profile.date_of_birth).toBe("1990-06-15");
  });

  it("accepts optional gender without error", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith", gender: "Female" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { profile: { gender: string } } };
    expect(body.data.profile.gender).toBe("Female");
  });

  it("accepts optional wellnessPreferences array without error", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    const preferences = ["activity", "sleep"];

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith", wellnessPreferences: preferences });

    expect(res.status).toBe(200);
    const body = res.body as { data: { profile: { wellness_preferences: string } } };
    expect(JSON.parse(body.data.profile.wellness_preferences)).toEqual(preferences);
  });
});

// ---------------------------------------------------------------------------
// Profile persisted to DB
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — persists to profiles table", () => {
  it("creates a profile row in the database for the authenticated user", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith" });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT * FROM profiles WHERE user_id = ?")
      .get(USER_ID) as { full_name: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.full_name).toBe("Alice Smith");
  });

  it("second PUT updates the existing profile row rather than creating a duplicate", async () => {
    const app = await buildApp();
    await registerUser(USER_ID);
    const token = makeToken(USER_ID);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Smith" });

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Alice Updated" });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const rows = db
      .prepare("SELECT * FROM profiles WHERE user_id = ?")
      .all(USER_ID) as Array<{ full_name: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.full_name).toBe("Alice Updated");
  });
});

// ---------------------------------------------------------------------------
// 401 without token
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — no auth token → 401", () => {
  it("returns HTTP 401 when no Authorization header is sent", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .put("/api/v1/profile")
      .send({ fullName: "Alice Smith" });

    expect(res.status).toBe(401);
  });
});

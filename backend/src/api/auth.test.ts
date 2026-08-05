import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { correlationIdMiddleware } from "../middleware/correlationId.js";
import { errorHandler } from "../middleware/errorHandler.js";
import type { ErrorResponse } from "../types/errors.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

// ---------------------------------------------------------------------------
// Test app factory — fresh in-memory DB + isolated module instances per test
// ---------------------------------------------------------------------------

async function buildApp() {
  vi.resetModules();
  process.env.DB_PATH = ":memory:";
  process.env.JWT_SECRET = "test-jwt-secret-register";

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { authRouter } = await import("./authController.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/auth", authRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// 1. Successful registration
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — mode=register", () => {
  it("returns HTTP 201 on a valid registration", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "sarah@example.com",
      password: "StrongPass!23",
      fullName: "Sarah Chen",
    });
    expect(res.status).toBe(201);
  });

  it("response data contains user id, email, fullName and personaMode=default", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "sarah@example.com",
      password: "StrongPass!23",
      fullName: "Sarah Chen",
    });
    const body = res.body as { data: { user: Record<string, unknown> } };
    expect(typeof body.data.user.id).toBe("string");
    expect(body.data.user.email).toBe("sarah@example.com");
    expect(body.data.user.fullName).toBe("Sarah Chen");
    expect(body.data.user.personaMode).toBe("default");
  });

  it("response data contains requiresOnboarding=true", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "sarah@example.com",
      password: "StrongPass!23",
      fullName: "Sarah Chen",
    });
    const body = res.body as { data: { requiresOnboarding: boolean } };
    expect(body.data.requiresOnboarding).toBe(true);
  });

  it("response includes meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "sarah@example.com",
      password: "StrongPass!23",
      fullName: "Sarah Chen",
    });
    const body = res.body as { meta: { correlationId: string } };
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("persists the user with account_status=pending_verification", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "stored@example.com",
      password: "StrongPass!23",
      fullName: "Test User",
    });

    // Inspect the database directly
    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT account_status FROM users WHERE email = ?")
      .get("stored@example.com") as { account_status: string } | undefined;
    expect(row?.account_status).toBe("pending_verification");
  });

  it("stores full_name in the users table", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "fullname@example.com",
      password: "StrongPass!23",
      fullName: "Full Name Test",
    });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT full_name FROM users WHERE email = ?")
      .get("fullname@example.com") as { full_name: string } | undefined;
    expect(row?.full_name).toBe("Full Name Test");
  });

  it("does not store the plaintext password — stores a hash instead", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "hash@example.com",
      password: "MySecret#123",
      fullName: "Hash Test",
    });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT password_hash FROM users WHERE email = ?")
      .get("hash@example.com") as { password_hash: string } | undefined;
    expect(row?.password_hash).not.toBe("MySecret#123");
    expect(typeof row?.password_hash).toBe("string");
    expect((row?.password_hash ?? "").length).toBeGreaterThan(20);
  });

  it("normalises email to lowercase before persisting", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "UPPER@Example.COM",
      password: "StrongPass!23",
      fullName: "Case Test",
    });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT email FROM users WHERE email = ?")
      .get("upper@example.com") as { email: string } | undefined;
    expect(row?.email).toBe("upper@example.com");
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicate email
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — mode=register, duplicate email", () => {
  it("returns HTTP 422 when the email is already registered", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "dupe@example.com",
      password: "StrongPass!23",
      fullName: "First User",
    });
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "dupe@example.com",
      password: "AnotherPass!23",
      fullName: "Second User",
    });
    expect(res.status).toBe(422);
  });

  it("error response does not reveal password or internal state on duplicate email", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "dupe2@example.com",
      password: "StrongPass!23",
      fullName: "First",
    });
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "dupe2@example.com",
      password: "AnotherPass!23",
      fullName: "Second",
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("AnotherPass");
    expect(text).not.toContain("password_hash");
  });
});

// ---------------------------------------------------------------------------
// 3. Validation failures
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — mode=register, validation", () => {
  it("returns HTTP 422 when email is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      password: "StrongPass!23",
      fullName: "No Email",
    });
    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when email is not a valid email format", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "not-an-email",
      password: "StrongPass!23",
      fullName: "Bad Email",
    });
    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when password is missing for register", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "nopw@example.com",
      fullName: "No Password",
    });
    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when password is fewer than 8 characters", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "short@example.com",
      password: "short",
      fullName: "Short PW",
    });
    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when fullName is missing for register", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "noname@example.com",
      password: "StrongPass!23",
    });
    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when fullName is fewer than 2 characters", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "shortname@example.com",
      password: "StrongPass!23",
      fullName: "X",
    });
    expect(res.status).toBe(422);
  });

  it("validation error includes error.type = REQUEST_VALIDATION_FAILED", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "bad-email",
      password: "StrongPass!23",
      fullName: "Test",
    });
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("validation error response includes field-specific details", async () => {
    const app = await buildApp();
    const res = await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "bad-email",
      password: "StrongPass!23",
      fullName: "Test User",
    });
    const body = res.body as ErrorResponse;
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Security logging
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — mode=register, security logging", () => {
  it("emits a security log on successful registration", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "logtest@example.com",
      password: "StrongPass!23",
      fullName: "Log Test",
    });
    const calls = consoleSpy.mock.calls;
    const registrationLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "auth.session_attempt",
    );
    expect(registrationLog).toBeDefined();
  });

  it("emits a security log on failed registration attempt (validation)", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "bad-email",
      password: "StrongPass!23",
      fullName: "Log Fail",
    });
    const calls = consoleSpy.mock.calls;
    const registrationLog = calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "auth.session_attempt",
    );
    expect(registrationLog).toBeDefined();
  });

  it("security log does not contain the plaintext password", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send({
      mode: "register",
      email: "logpw@example.com",
      password: "SuperSecret!99",
      fullName: "PW Log Test",
    });
    const allLogOutput = JSON.stringify(consoleSpy.mock.calls);
    expect(allLogOutput).not.toContain("SuperSecret!99");
  });
});

// ---------------------------------------------------------------------------
// 5. Migration: users table has full_name column
// ---------------------------------------------------------------------------

describe("users table schema — full_name column", () => {
  it("users table has a full_name column after migration", async () => {
    vi.resetModules();
    process.env.DB_PATH = ":memory:";

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    const cols = db
      .prepare("PRAGMA table_info(users)")
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("full_name");
  });

  it("full_name column is NOT NULL", async () => {
    vi.resetModules();
    process.env.DB_PATH = ":memory:";

    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();

    expect(() =>
      db
        .prepare(
          "INSERT INTO users (id, email, password_hash, full_name, account_status, created_at, updated_at) VALUES ('u1','t@t.com','h',NULL,'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
        )
        .run(),
    ).toThrow();
  });
});

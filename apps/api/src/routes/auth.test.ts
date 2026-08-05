import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "routes-auth-test-"));
  }

  get tmpDir(): string {
    return this._tmpDir;
  }

  cleanup(): void {
    rmSync(this._tmpDir, { recursive: true, force: true });
  }
}

let ctx: TestContext;
let consoleSpy: MockInstance;

beforeEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx = new TestContext();
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  consoleSpy.mockRestore();
  delete process.env["DB_PATH"];
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env["DB_PATH"] = dbPath;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { authRouter } = await import("./auth.js");
  const { correlationIdMiddleware } = await import(
    "../middleware/correlationId.js"
  );
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/auth", authRouter);
  app.use(errorHandler);
  return app;
}

const VALID_PAYLOAD = {
  mode: "register",
  email: "alice@example.com",
  password: "securepass123",
  fullName: "Alice Smith",
};

// ---------------------------------------------------------------------------
// 201 on valid input
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — valid registration → 201", () => {
  it("returns HTTP 201 for a valid registration payload", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
  });

  it("returns data.id as a UUID", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { id: string } };
    expect(body.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns data.email matching the submitted email (lowercased)", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, email: "ALICE@EXAMPLE.COM" });

    const body = res.body as { data: { email: string } };
    expect(body.data.email).toBe("alice@example.com");
  });

  it("does not include a password field in the response data", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send(VALID_PAYLOAD);

    const body = res.body as Record<string, unknown>;
    const data = body["data"] as Record<string, unknown>;
    expect(Object.keys(data)).not.toContain("password");
    expect(Object.keys(data)).not.toContain("passwordHash");
    expect(Object.keys(data)).not.toContain("password_hash");
  });

  it("returns meta.correlationId as a non-empty string", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send(VALID_PAYLOAD);

    const body = res.body as { meta: { correlationId: string } };
    expect(typeof body.meta.correlationId).toBe("string");
    expect(body.meta.correlationId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Password hashing — never store plain text
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — password is stored as bcrypt hash", () => {
  it("stores a bcrypt hash that verifies correctly against the plain-text password", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT password_hash FROM users WHERE email = ?")
      .get("alice@example.com") as { password_hash: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    const match = await bcrypt.compare("securepass123", row!.password_hash);
    expect(match).toBe(true);
  });

  it("stored hash does not equal the plain-text password", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT password_hash FROM users WHERE email = ?")
      .get("alice@example.com") as { password_hash: string } | undefined;
    db.close();

    expect(row!.password_hash).not.toBe("securepass123");
  });
});

// ---------------------------------------------------------------------------
// account_status = pending_verification
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — persists account_status = pending_verification", () => {
  it("inserts the user row with account_status='pending_verification'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT account_status FROM users WHERE email = ?")
      .get("alice@example.com") as { account_status: string } | undefined;
    db.close();

    expect(row?.account_status).toBe("pending_verification");
  });

  it("stores the caller-supplied fullName in the users row", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT full_name FROM users WHERE email = ?")
      .get("alice@example.com") as { full_name: string } | undefined;
    db.close();

    expect(row?.full_name).toBe("Alice Smith");
  });
});

// ---------------------------------------------------------------------------
// 409 on duplicate email — without leaking password
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — duplicate email → 409", () => {
  it("returns HTTP 409 when the same email is registered twice", async () => {
    const app = await buildApp();

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, password: "differentPass1" });

    expect(res.status).toBe(409);
  });

  it("returns error.type CONFLICT on duplicate email", async () => {
    const app = await buildApp();

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, password: "differentPass1" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("CONFLICT");
  });

  it("409 response does not contain the word 'password' in the body", async () => {
    const app = await buildApp();

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, password: "differentPass1" });

    const bodyText = JSON.stringify(res.body);
    expect(bodyText.toLowerCase()).not.toContain("password");
  });

  it("409 response does not reveal that an account exists with that email beyond the generic conflict message", async () => {
    const app = await buildApp();

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, password: "differentPass1" });

    const body = res.body as { error: { details: Array<{ message: string }> } };
    const messages = body.error.details.map((d) => d.message);
    expect(messages[0]).toBe("An account with this email already exists.");
  });
});

// ---------------------------------------------------------------------------
// 400 on missing / malformed fields
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — missing fields → 400/422", () => {
  it("returns HTTP 400 when mode is not 'register'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: "x@x.com", password: "pass1234", fullName: "Bob" });

    expect(res.status).toBe(400);
  });

  it("returns HTTP 422 when email is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", password: "pass1234", fullName: "Bob" });

    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when email is not a valid email address", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "not-an-email", password: "pass1234", fullName: "Bob" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'email' when email is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", password: "pass1234", fullName: "Bob" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "email")).toBe(true);
  });

  it("returns HTTP 422 when password is fewer than 8 characters", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "bob@example.com", password: "short", fullName: "Bob" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'password' when password is too short", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "bob@example.com", password: "short", fullName: "Bob" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "password")).toBe(true);
  });

  it("returns HTTP 422 when fullName is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "bob@example.com", password: "pass1234" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'fullName' when fullName is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "bob@example.com", password: "pass1234" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "fullName")).toBe(true);
  });

  it("returns HTTP 422 when fullName is a single character (below min length of 2)", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "bob@example.com", password: "pass1234", fullName: "B" });

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Security log emitted on every attempt
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session — security log emitted on every attempt", () => {
  it("emits console.log with event 'auth.registration_attempt' on a successful registration", async () => {
    const app = await buildApp();
    consoleSpy.mockClear();

    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasAttemptEvent = calls.some(
      (arg) =>
        typeof arg === "object" && arg["event"] === "auth.registration_attempt",
    );
    expect(hasAttemptEvent).toBe(true);
  });

  it("emits console.log with event 'auth.registration_attempt' on a duplicate email (409)", async () => {
    const app = await buildApp();
    await supertest(app).post("/api/v1/auth/session").send(VALID_PAYLOAD);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, password: "differentPass1" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasAttemptEvent = calls.some(
      (arg) =>
        typeof arg === "object" && arg["event"] === "auth.registration_attempt",
    );
    expect(hasAttemptEvent).toBe(true);
  });

  it("emits console.log with event 'auth.registration_attempt' when mode is not 'register' (400)", async () => {
    const app = await buildApp();
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: "x@x.com", password: "pass1234", fullName: "Bob" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasAttemptEvent = calls.some(
      (arg) =>
        typeof arg === "object" && arg["event"] === "auth.registration_attempt",
    );
    expect(hasAttemptEvent).toBe(true);
  });

  it("emits console.log with event 'auth.registration_attempt' when validation fails (422)", async () => {
    const app = await buildApp();
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "register", email: "not-an-email", password: "pass1234", fullName: "Bob" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasAttemptEvent = calls.some(
      (arg) =>
        typeof arg === "object" && arg["event"] === "auth.registration_attempt",
    );
    expect(hasAttemptEvent).toBe(true);
  });

  it("log event includes the email address (lowercased)", async () => {
    const app = await buildApp();
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ ...VALID_PAYLOAD, email: "ALICE@EXAMPLE.COM" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const attemptLog = calls.find(
      (arg) =>
        typeof arg === "object" && arg["event"] === "auth.registration_attempt",
    );
    expect(attemptLog?.["email"]).toBe("alice@example.com");
  });
});

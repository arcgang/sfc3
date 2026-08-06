import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
  type Mock,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

const TEST_JWT_SECRET = "test-jwt-secret-for-auth-tests";

interface FakeEmailClient {
  sendPasswordResetInstructions: Mock;
}

function buildFakeEmailClient(): FakeEmailClient {
  return {
    sendPasswordResetInstructions: vi.fn().mockResolvedValue(undefined),
  };
}

async function buildApp(emailClient?: FakeEmailClient) {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env["DB_PATH"] = dbPath;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { buildAuthRouter } = await import("./auth.js");
  const { correlationIdMiddleware } = await import(
    "../middleware/correlationId.js"
  );
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/auth", buildAuthRouter(TEST_JWT_SECRET, emailClient));
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
  it("returns HTTP 400 when mode is an unrecognised value", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "unknown_mode", email: "x@x.com", password: "pass1234", fullName: "Bob" });

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

  it("emits console.log with event 'auth.registration_attempt' when mode is unrecognised (400)", async () => {
    const app = await buildApp();
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "unknown_mode", email: "x@x.com", password: "pass1234", fullName: "Bob" });

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

// ---------------------------------------------------------------------------
// Helper: register a user then attempt login
// ---------------------------------------------------------------------------

async function registerUser(
  app: ReturnType<typeof express>,
  payload = VALID_PAYLOAD,
) {
  await supertest(app).post("/api/v1/auth/session").send(payload);
}

// ---------------------------------------------------------------------------
// Login — 200 on valid credentials
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=login — valid credentials → 200", () => {
  it("returns HTTP 200 for valid email and password", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    expect(res.status).toBe(200);
  });

  it("returns data.user.id matching the registered user id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await registerUser(app);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(VALID_PAYLOAD.email) as { id: string } | undefined;
    db.close();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const body = res.body as { data: { user: { id: string } } };
    expect(body.data.user.id).toBe(row?.id);
  });

  it("returns data.user.email matching the registered email (lowercased)", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email.toUpperCase(), password: VALID_PAYLOAD.password });

    const body = res.body as { data: { user: { email: string } } };
    expect(body.data.user.email).toBe(VALID_PAYLOAD.email.toLowerCase());
  });

  it("returns data.user.fullName matching the registered fullName", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const body = res.body as { data: { user: { fullName: string } } };
    expect(body.data.user.fullName).toBe(VALID_PAYLOAD.fullName);
  });

  it("returns data.accessToken as a non-empty string", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const body = res.body as { data: { accessToken: string } };
    expect(typeof body.data.accessToken).toBe("string");
    expect(body.data.accessToken.length).toBeGreaterThan(0);
  });

  it("accessToken is a valid JWT signed with the server secret and contains sub = user.id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await registerUser(app);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(VALID_PAYLOAD.email) as { id: string } | undefined;
    db.close();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const body = res.body as { data: { accessToken: string } };
    const decoded = jwt.verify(body.data.accessToken, TEST_JWT_SECRET) as { sub: string };
    expect(decoded.sub).toBe(row?.id);
  });

  it("returns data.expiresAt as an ISO 8601 timestamp in the future", async () => {
    const app = await buildApp();
    await registerUser(app);

    const before = Date.now();
    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const body = res.body as { data: { expiresAt: string } };
    const expiresMs = new Date(body.data.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThan(before);
  });

  it("returns meta.correlationId as a non-empty string", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const body = res.body as { meta: { correlationId: string } };
    expect(typeof body.meta.correlationId).toBe("string");
    expect(body.meta.correlationId.length).toBeGreaterThan(0);
  });

  it("does not expose password_hash in the response", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const bodyText = JSON.stringify(res.body);
    expect(bodyText.toLowerCase()).not.toContain("password");
  });
});

// ---------------------------------------------------------------------------
// Login — 401 on invalid credentials
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=login — invalid credentials → 401", () => {
  it("returns HTTP 401 for a wrong password", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_INVALID_CREDENTIALS for a wrong password", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: "wrongpassword" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("returns HTTP 401 for an unknown email", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: "nobody@example.com", password: "somepassword" });

    expect(res.status).toBe(401);
  });

  it("error message does not confirm whether the account exists", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: "nobody@example.com", password: "somepassword" });

    const body = res.body as { error: { details: Array<{ message: string }> } };
    const message = body.error.details[0]?.message ?? "";
    expect(message).toBe("Invalid email or password.");
  });

  it("wrong-password response does not differ structurally from unknown-email response", async () => {
    const app = await buildApp();
    await registerUser(app);

    const wrongPwRes = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: "wrongpassword" });

    const unknownRes = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: "nobody@example.com", password: "somepassword" });

    expect(wrongPwRes.status).toBe(unknownRes.status);
    const wBody = wrongPwRes.body as { error: { type: string } };
    const uBody = unknownRes.body as { error: { type: string } };
    expect(wBody.error.type).toBe(uBody.error.type);
  });
});

// ---------------------------------------------------------------------------
// Login — engagement event recorded on success
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=login — engagement event recorded", () => {
  it("inserts a login engagement event with event_type='login' on successful login", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await registerUser(app);

    const db = new Database(dbPath);
    const userId = (
      db.prepare("SELECT id FROM users WHERE email = ?").get(VALID_PAYLOAD.email) as { id: string }
    ).id;

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const row = db
      .prepare(
        "SELECT event_type, user_id FROM engagement_events WHERE user_id = ? AND event_type = 'login'",
      )
      .get(userId) as { event_type: string; user_id: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.event_type).toBe("login");
    expect(row?.user_id).toBe(userId);
  });

  it("does not insert a login engagement event when credentials are wrong", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await registerUser(app);

    const db = new Database(dbPath);
    const userId = (
      db.prepare("SELECT id FROM users WHERE email = ?").get(VALID_PAYLOAD.email) as { id: string }
    ).id;

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: "wrongpassword" });

    const count = (
      db
        .prepare(
          "SELECT COUNT(*) as n FROM engagement_events WHERE user_id = ? AND event_type = 'login'",
        )
        .get(userId) as { n: number }
    ).n;
    db.close();

    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Login — structured console log emitted on every attempt
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=login — security log emitted on every attempt", () => {
  it("emits console.log with event 'auth.login_attempt' on a successful login", async () => {
    const app = await buildApp();
    await registerUser(app);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: VALID_PAYLOAD.password });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(hasEvent).toBe(true);
  });

  it("emits console.log with event 'auth.login_attempt' on a failed login (wrong password)", async () => {
    const app = await buildApp();
    await registerUser(app);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email, password: "wrongpassword" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(hasEvent).toBe(true);
  });

  it("emits console.log with event 'auth.login_attempt' on a failed login (unknown email)", async () => {
    const app = await buildApp();
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: "ghost@example.com", password: "somepassword" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(hasEvent).toBe(true);
  });

  it("login attempt log includes the email address (lowercased)", async () => {
    const app = await buildApp();
    await registerUser(app);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "login", email: VALID_PAYLOAD.email.toUpperCase(), password: VALID_PAYLOAD.password });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const loginLog = calls.find(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(loginLog?.["email"]).toBe(VALID_PAYLOAD.email.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// Password reset request — always returns generic accepted response
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=password_reset_request", () => {
  it("returns HTTP 200 for a known email", async () => {
    const app = await buildApp();
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: VALID_PAYLOAD.email });

    expect(res.status).toBe(200);
  });

  it("returns HTTP 200 for an unknown email (does not reveal account existence)", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "ghost@example.com" });

    expect(res.status).toBe(200);
  });

  it("returns the generic instructional message regardless of account existence", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "ghost@example.com" });

    const body = res.body as { data: { message: string } };
    expect(body.data.message).toBe(
      "If the account exists, password reset instructions have been sent.",
    );
  });

  it("returns 422 when email is missing from password_reset_request", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request" });

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Password reset — security log event auth.password_reset_requested
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=password_reset_request — security log emitted", () => {
  it("emits console.log with event 'auth.password_reset_requested' for a known email", async () => {
    const emailClient = buildFakeEmailClient();
    const app = await buildApp(emailClient);
    await registerUser(app);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: VALID_PAYLOAD.email });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "auth.password_reset_requested",
    );
    expect(hasEvent).toBe(true);
  });

  it("emits console.log with event 'auth.password_reset_requested' for an unknown email", async () => {
    const emailClient = buildFakeEmailClient();
    const app = await buildApp(emailClient);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "ghost@example.com" });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "auth.password_reset_requested",
    );
    expect(hasEvent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Password reset — email service dispatched iff account exists
// ---------------------------------------------------------------------------

describe("POST /api/v1/auth/session mode=password_reset_request — email service call", () => {
  it("calls sendPasswordResetInstructions with the lowercased email when the account exists", async () => {
    const emailClient = buildFakeEmailClient();
    const app = await buildApp(emailClient);
    await registerUser(app);

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: VALID_PAYLOAD.email.toUpperCase() });

    expect(emailClient.sendPasswordResetInstructions).toHaveBeenCalledTimes(1);
    expect(emailClient.sendPasswordResetInstructions).toHaveBeenCalledWith(
      VALID_PAYLOAD.email.toLowerCase(),
    );
  });

  it("does not call sendPasswordResetInstructions when no account matches the email", async () => {
    const emailClient = buildFakeEmailClient();
    const app = await buildApp(emailClient);

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "nobody@example.com" });

    expect(emailClient.sendPasswordResetInstructions).not.toHaveBeenCalled();
  });

  it("still returns 200 with the generic message even when the email service throws", async () => {
    const emailClient = buildFakeEmailClient();
    emailClient.sendPasswordResetInstructions.mockRejectedValueOnce(
      new Error("SMTP unavailable"),
    );
    const app = await buildApp(emailClient);
    await registerUser(app);

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: VALID_PAYLOAD.email });

    expect(res.status).toBe(200);
    const body = res.body as { data: { message: string } };
    expect(body.data.message).toBe(
      "If the account exists, password reset instructions have been sent.",
    );
  });

  it("still emits auth.password_reset_requested even when the email service throws", async () => {
    const emailClient = buildFakeEmailClient();
    emailClient.sendPasswordResetInstructions.mockRejectedValueOnce(
      new Error("SMTP unavailable"),
    );
    const app = await buildApp(emailClient);
    await registerUser(app);
    consoleSpy.mockClear();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: VALID_PAYLOAD.email });

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "auth.password_reset_requested",
    );
    expect(hasEvent).toBe(true);
  });
});

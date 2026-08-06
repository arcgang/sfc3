/**
 * Acceptance tests — "Request a password reset by email"
 *
 * Exercises the seam between the three tasks:
 *   - Foundation: Backend API infrastructure (apps/api) — Express app wiring,
 *     correlation-ID middleware, error handler
 *   - Backend: POST /api/v1/auth/session with mode=password_reset_request
 *   - Frontend: ForgotPasswordPage UI (covered in the web-side test file;
 *     criteria 1 & 2 are tested there)
 *
 * What no existing unit test covers is:
 *   AC3: the real endpoint route is mounted and reachable
 *   AC4: response body content regardless of email match
 *   AC5: EmailServiceClient is called when a matching account exists
 *   AC6: HTTP 200 in all non-error cases; no account-existence leak
 *   AC7: auth.password_reset_requested console log for every request
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import Database from "better-sqlite3";
import type { EmailServiceClient } from "./integrations/EmailServiceClient.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "db/migrations",
);

const TEST_JWT_SECRET = "test-jwt-secret-password-reset-acceptance";

// ── TestContext — per-test isolated DB + console spy ─────────────────────────

class TestContext {
  private readonly _tmpDir: string;
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;
  readonly emailClient: {
    sendPasswordResetInstructions: ReturnType<typeof vi.fn>;
  };

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "password-reset-acceptance-"));
    this.emailClient = {
      sendPasswordResetInstructions: vi.fn().mockResolvedValue(undefined),
    };
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
  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();
  ctx = new TestContext();
  ctx.startConsoleSpy();
  vi.resetModules();
});

afterEach(async () => {
  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

// ── App builder: mirrors production wiring ────────────────────────────────────

async function buildApp(emailClient?: EmailServiceClient) {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { migrate } = await import("./db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { buildAuthRouter } = await import("./routes/auth.js");
  const { correlationIdMiddleware } = await import("./middleware/correlationId.js");
  const { errorHandler } = await import("./middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/api/v1/auth",
    buildAuthRouter(TEST_JWT_SECRET, emailClient ?? (ctx.emailClient as EmailServiceClient)),
  );
  app.use(errorHandler);
  return app;
}

async function seedUser(email: string, id = "user-001"): Promise<string> {
  const dbPath = join(ctx.tmpDir, "test.db");
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, account_status)
     VALUES (?, ?, 'hashed_password', 'active')`,
  ).run(id, email.toLowerCase());
  db.close();
  return id;
}

// ── Precondition — migrations must have been applied ─────────────────────────

describe("precondition — users table migration is applied", () => {
  it("users table has id, email, password_hash columns before any behavioural test runs", async () => {
    const dbPath = join(ctx.tmpDir, "precond.db");
    process.env.DB_PATH = dbPath;

    const { migrate } = await import("./db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const { getDatabase } = await import("./db/connection.js");
    const db = getDatabase();

    // If the migration wasn't applied this query throws — that would
    // cause the precondition test to fail rather than silently pass.
    const row = db
      .prepare("SELECT id, email, password_hash FROM users LIMIT 0")
      .get();
    expect(row).toBeUndefined();
  });
});

// ── AC3 — submitting the form calls POST /api/v1/auth/session mode=password_reset_request ──

describe("AC3 — POST /api/v1/auth/session with mode=password_reset_request is routed and reachable", () => {
  it("POST /api/v1/auth/session with mode=password_reset_request does not return 404", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "anyone@example.com" });

    expect(res.status).not.toBe(404);
  });

  it("returns 200 for a well-formed password_reset_request body", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "anyone@example.com" });

    expect(res.status).toBe(200);
  });
});

// ── AC4 — response always displays the neutral message ───────────────────────

describe("AC4 — neutral message regardless of whether the email matches an account", () => {
  const EXPECTED_MSG =
    "If the account exists, password reset instructions have been sent.";

  it("response body contains the neutral message when email matches an existing account", async () => {
    const app = await buildApp();
    await seedUser("known@example.com");

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "known@example.com" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { message: string } };
    expect(body.data.message).toBe(EXPECTED_MSG);
  });

  it("response body contains the neutral message when email does NOT match any account", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "nobody@example.com" });

    expect(res.status).toBe(200);
    const body = res.body as { data: { message: string } };
    expect(body.data.message).toBe(EXPECTED_MSG);
  });
});

// ── AC5 — email service is called when a matching account exists ──────────────

describe("AC5 — EmailServiceClient.sendPasswordResetInstructions called when account exists", () => {
  it("sendPasswordResetInstructions is called with the submitted email when account is found", async () => {
    const app = await buildApp();
    await seedUser("match@example.com");

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "match@example.com" });

    expect(ctx.emailClient.sendPasswordResetInstructions).toHaveBeenCalledTimes(1);
    expect(ctx.emailClient.sendPasswordResetInstructions).toHaveBeenCalledWith(
      "match@example.com",
    );
  });

  it("sendPasswordResetInstructions is NOT called when no account is found", async () => {
    const app = await buildApp();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "ghost@example.com" });

    expect(ctx.emailClient.sendPasswordResetInstructions).not.toHaveBeenCalled();
  });
});

// ── AC6 — HTTP 200 in all non-error cases; no account-existence leak ──────────

describe("AC6 — endpoint returns HTTP 200 and response body does not reveal account existence", () => {
  it("returns 200 when email matches an existing account", async () => {
    const app = await buildApp();
    await seedUser("exists@example.com");

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "exists@example.com" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when email does NOT match any account", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "absent@example.com" });

    expect(res.status).toBe(200);
  });

  it("response body is identical whether email matches or not (no existence leak)", async () => {
    // Two requests: one for an existing user, one for a non-existent user.
    // The body content must be identical so the caller cannot infer account existence.
    const appExists = await buildApp();
    await seedUser("leakcheck@example.com", "leak-user-001");

    const resExists = await supertest(appExists)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "leakcheck@example.com" });

    // Reset for second request
    const { resetDatabase } = await import("./db/connection.js");
    resetDatabase();
    vi.resetModules();

    const appAbsent = await buildApp();

    const resAbsent = await supertest(appAbsent)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "nomatch@example.com" });

    expect(resExists.status).toBe(resAbsent.status);
    const bodyExists = resExists.body as { data: { message: string } };
    const bodyAbsent = resAbsent.body as { data: { message: string } };
    expect(bodyExists.data.message).toBe(bodyAbsent.data.message);
  });

  it("response body data field has no field that indicates whether the account exists", async () => {
    const app = await buildApp();
    await seedUser("probeexists@example.com");

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "probeexists@example.com" });

    const data = (res.body as { data: Record<string, unknown> }).data;
    const keys = Object.keys(data);
    // Only the neutral 'message' field should be present
    expect(keys).toEqual(["message"]);
  });
});

// ── AC7 — auth.password_reset_requested console log on every request ──────────

describe("AC7 — auth.password_reset_requested log event emitted for every reset request", () => {
  function findResetLog(
    calls: Parameters<typeof console.log>[][],
  ): Record<string, unknown> | undefined {
    const match = calls.find(
      (call) =>
        call.length > 0 &&
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "auth.password_reset_requested",
    );
    return match ? (match[0] as Record<string, unknown>) : undefined;
  }

  it("emits auth.password_reset_requested log when email matches an existing account", async () => {
    const app = await buildApp();
    await seedUser("logtest-existing@example.com");

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "logtest-existing@example.com" });

    const log = findResetLog(ctx.consoleSpy.mock.calls);
    expect(log).toBeDefined();
    expect(log?.["event"]).toBe("auth.password_reset_requested");
  });

  it("emits auth.password_reset_requested log when email does NOT match any account", async () => {
    const app = await buildApp();

    await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "logtest-absent@example.com" });

    const log = findResetLog(ctx.consoleSpy.mock.calls);
    expect(log).toBeDefined();
    expect(log?.["event"]).toBe("auth.password_reset_requested");
  });

  it("log entry contains the correlationId from the request", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "logtest-corr@example.com" });

    const log = findResetLog(ctx.consoleSpy.mock.calls);
    expect(log).toBeDefined();
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(log?.["correlationId"]).toMatch(UUID_RE);
    expect(log?.["correlationId"]).toBe(res.headers["x-correlation-id"]);
  });
});

// ── AC6 (edge) — validation: missing/invalid email returns 400 not 200 ────────

describe("AC6 (edge) — malformed requests are rejected before the 200 path", () => {
  it("omitting mode field returns 400 with REQUEST_VALIDATION_FAILED", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ email: "anyone@example.com" });

    expect(res.status).toBe(400);
  });

  it("omitting email with mode=password_reset_request returns 422", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request" });

    expect(res.status).toBe(422);
  });

  it("invalid email format with mode=password_reset_request returns 422", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .post("/api/v1/auth/session")
      .send({ mode: "password_reset_request", email: "not-an-email" });

    expect(res.status).toBe(422);
  });
});

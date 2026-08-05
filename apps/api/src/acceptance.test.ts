/**
 * End-to-end acceptance tests for the Express API bootstrap story.
 *
 * These tests exercise all four tasks (Express wiring, correlation-ID
 * middleware, JWT auth middleware, validation middleware + error handler)
 * together through the real entry points, testing the seams between them
 * that no existing unit test covers.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { z } from "zod";
import http from "node:http";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { authMiddleware } from "./middleware/auth.js";
import { validateBody } from "./middleware/validate.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { buildConfig } from "./config.js";
import type { ErrorResponse } from "./types/errors.js";

// ── shared constants ────────────────────────────────────────────────────────

const TEST_SECRET = "acceptance-test-secret-key";
const VALID_PAYLOAD = { sub: "user-abc", email: "user@example.com" };
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const echoSchema = z.object({ message: z.string().min(1) });

// ── full-stack app builder (mirrors production index.ts, minus the listen) ──

function buildApp() {
  const app = express();

  app.use(express.json());
  // Task 2: correlation-ID middleware must run first so every downstream
  // handler (auth, validate, errorHandler) can read res.locals.correlationId
  app.use(correlationIdMiddleware);

  // Public route
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Task 3: JWT auth — protected route
  const requireAuth = authMiddleware(TEST_SECRET);
  app.get("/api/v1/me", requireAuth, (_req: Request, res: Response) => {
    res.json({ user: res.locals["user"] });
  });

  // Task 4: schema validation
  app.post(
    "/echo",
    validateBody(echoSchema),
    (req: Request, res: Response) => {
      const { message } = req.body as z.infer<typeof echoSchema>;
      res.json({ message });
    },
  );

  // Route that triggers an unhandled server fault (Task 5)
  app.get(
    "/fault",
    (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error("deliberate-unhandled-fault"));
    },
  );

  // Task 2 / Task 5: global error handler must come last
  app.use(errorHandler);

  return app;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Assert that obj matches the full ErrorResponse schema (criterion 6). */
function assertErrorResponseSchema(body: ErrorResponse, headerCorrelationId?: string) {
  // meta.correlationId must be a UUID
  expect(body.meta.correlationId).toMatch(UUID_RE);
  // meta.timestamp must be ISO 8601 UTC
  expect(body.meta.timestamp).toMatch(ISO_UTC_RE);
  expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  // error.type must be a string
  expect(typeof body.error.type).toBe("string");
  expect(body.error.type.length).toBeGreaterThan(0);
  // error.details must be an array
  expect(Array.isArray(body.error.details)).toBe(true);

  // criterion 7: X-Correlation-Id header matches meta.correlationId
  if (headerCorrelationId !== undefined) {
    expect(body.meta.correlationId).toBe(headerCorrelationId);
  }
}

// ── criterion 1: server starts and accepts requests on a configured port ────

describe("Criterion 1 – server starts and accepts requests on a configured port", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    // buildConfig reads JWT_SECRET from env; supply one for the test
    const config = buildConfig({ JWT_SECRET: TEST_SECRET, PORT: "0" });
    const app = buildApp();
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(config.port === 0 ? 0 : 0, () => resolve());
    });

    const addr = server.address();
    port =
      addr !== null && typeof addr === "object" ? addr.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("binds to a port and responds to HTTP requests", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("buildConfig reads PORT from the environment", () => {
    const cfg = buildConfig({ JWT_SECRET: TEST_SECRET, PORT: "4321" });
    expect(cfg.port).toBe(4321);
  });

  it("buildConfig throws when JWT_SECRET is absent", () => {
    expect(() => buildConfig({})).toThrow(/JWT_SECRET/);
  });
});

// ── criterion 2: every response carries an X-Correlation-Id UUID header ─────

describe("Criterion 2 – every response carries X-Correlation-Id with a server-generated UUID", () => {
  const app = buildApp();

  it("X-Correlation-Id header is present on a normal 200 response", async () => {
    const res = await supertest(app).get("/health");
    expect(res.headers["x-correlation-id"]).toBeDefined();
  });

  it("X-Correlation-Id is a valid UUID v4", async () => {
    const res = await supertest(app).get("/health");
    expect(res.headers["x-correlation-id"]).toMatch(UUID_RE);
  });

  it("X-Correlation-Id is different on every request (server-generated per-request UUID)", async () => {
    const [r1, r2, r3] = await Promise.all([
      supertest(app).get("/health"),
      supertest(app).get("/health"),
      supertest(app).get("/health"),
    ]);
    const ids = [
      r1.headers["x-correlation-id"],
      r2.headers["x-correlation-id"],
      r3.headers["x-correlation-id"],
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("X-Correlation-Id header is present on 401 auth error responses", async () => {
    const res = await supertest(app).get("/api/v1/me");
    expect(res.headers["x-correlation-id"]).toMatch(UUID_RE);
  });

  it("X-Correlation-Id header is present on 422 validation error responses", async () => {
    const res = await supertest(app).post("/echo").send({});
    expect(res.headers["x-correlation-id"]).toMatch(UUID_RE);
  });

  it("X-Correlation-Id header is present on 500 error responses", async () => {
    const res = await supertest(app).get("/fault");
    expect(res.headers["x-correlation-id"]).toMatch(UUID_RE);
  });
});

// ── criterion 3: protected routes reject bad/missing/expired tokens → 401 ───

describe("Criterion 3 – missing, expired, or tampered JWT → HTTP 401 with AUTH_TOKEN_INVALID", () => {
  let app: ReturnType<typeof buildApp>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = buildApp();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("missing Authorization header → 401", async () => {
    const res = await supertest(app).get("/api/v1/me");
    expect(res.status).toBe(401);
  });

  it("missing Authorization header → error.type = AUTH_TOKEN_INVALID", async () => {
    const res = await supertest(app).get("/api/v1/me");
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("missing Authorization header → no stack trace in response body", async () => {
    const res = await supertest(app).get("/api/v1/me");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bError:/);
    expect(text).not.toMatch(/\bat /);
  });

  it("expired token → 401 with AUTH_TOKEN_INVALID", async () => {
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect((res.body as ErrorResponse).error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("expired token → no stack trace in response body", async () => {
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${expired}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bError:/);
    expect(text).not.toMatch(/\bat /);
  });

  it("tampered token (wrong secret) → 401 with AUTH_TOKEN_INVALID", async () => {
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
    expect((res.body as ErrorResponse).error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("tampered token → no stack trace in response body", async () => {
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${tampered}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bError:/);
    expect(text).not.toMatch(/\bat /);
  });

  it("malformed token string → 401 with AUTH_TOKEN_INVALID", async () => {
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer not-a-jwt-at-all");
    expect(res.status).toBe(401);
    expect((res.body as ErrorResponse).error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("valid token → 200 (control: protected route lets valid tokens through)", async () => {
    const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ── criterion 4: invalid body → 422 with REQUEST_VALIDATION_FAILED ──────────

describe("Criterion 4 – invalid body → HTTP 422 with REQUEST_VALIDATION_FAILED and error.details", () => {
  const app = buildApp();

  it("empty body → 422", async () => {
    const res = await supertest(app).post("/echo").send({});
    expect(res.status).toBe(422);
  });

  it("empty body → error.type = REQUEST_VALIDATION_FAILED", async () => {
    const res = await supertest(app).post("/echo").send({});
    expect((res.body as ErrorResponse).error.type).toBe(
      "REQUEST_VALIDATION_FAILED",
    );
  });

  it("error.details contains at least one entry with code, message, and field", async () => {
    const res = await supertest(app).post("/echo").send({});
    const body = res.body as ErrorResponse;
    expect(body.error.details.length).toBeGreaterThanOrEqual(1);
    const detail = body.error.details[0] as {
      code: string;
      message: string;
      field: string;
    };
    expect(typeof detail.code).toBe("string");
    expect(detail.code.length).toBeGreaterThan(0);
    expect(typeof detail.message).toBe("string");
    expect(detail.message.length).toBeGreaterThan(0);
    expect(typeof detail.field).toBe("string");
  });

  it("error.details[].field identifies the failing field path", async () => {
    const res = await supertest(app).post("/echo").send({});
    const body = res.body as ErrorResponse;
    const messageDetail = (
      body.error.details as Array<{ code: string; message: string; field: string }>
    ).find((d) => d.field === "message");
    expect(messageDetail).toBeDefined();
  });

  it("valid body → 200 (control: validation passes through correct requests)", async () => {
    const res = await supertest(app)
      .post("/echo")
      .send({ message: "hello" });
    expect(res.status).toBe(200);
    expect((res.body as { message: string }).message).toBe("hello");
  });
});

// ── criterion 5: unhandled faults → HTTP 500, stack trace only in console ───

describe("Criterion 5 – unhandled server fault → HTTP 500 with INTERNAL_ERROR, stack only in console", () => {
  let app: ReturnType<typeof buildApp>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = buildApp();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns HTTP 500 for an unhandled error", async () => {
    const res = await supertest(app).get("/fault");
    expect(res.status).toBe(500);
  });

  it("error.type = INTERNAL_ERROR", async () => {
    const res = await supertest(app).get("/fault");
    expect((res.body as ErrorResponse).error.type).toBe("INTERNAL_ERROR");
  });

  it("stack trace is NOT in the response body", async () => {
    const res = await supertest(app).get("/fault");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bError:/);
    expect(text).not.toMatch(/\bat /);
    expect(text).not.toContain("deliberate-unhandled-fault");
  });

  it("console.error is called with the error details (stack written to console)", async () => {
    await supertest(app).get("/fault");
    expect(errorSpy).toHaveBeenCalled();
    const loggedArg = errorSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(loggedArg).toBeDefined();
    // The logged object must contain the actual error object (stack in console)
    expect(loggedArg["err"]).toBeInstanceOf(Error);
  });
});

// ── criterion 6: all error responses conform to ErrorResponse schema ─────────

describe("Criterion 6 – all error responses conform to the shared ErrorResponse schema", () => {
  let app: ReturnType<typeof buildApp>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = buildApp();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("401 auth error conforms to ErrorResponse schema", async () => {
    const res = await supertest(app).get("/api/v1/me");
    assertErrorResponseSchema(
      res.body as ErrorResponse,
      res.headers["x-correlation-id"] as string,
    );
  });

  it("422 validation error conforms to ErrorResponse schema", async () => {
    const res = await supertest(app).post("/echo").send({});
    assertErrorResponseSchema(
      res.body as ErrorResponse,
      res.headers["x-correlation-id"] as string,
    );
  });

  it("500 server fault conforms to ErrorResponse schema", async () => {
    const res = await supertest(app).get("/fault");
    assertErrorResponseSchema(
      res.body as ErrorResponse,
      res.headers["x-correlation-id"] as string,
    );
  });
});

// ── criterion 7: X-Correlation-Id header matches meta.correlationId ──────────

describe("Criterion 7 – X-Correlation-Id header value matches meta.correlationId in every error response", () => {
  let app: ReturnType<typeof buildApp>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = buildApp();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("401 response: X-Correlation-Id header === meta.correlationId", async () => {
    const res = await supertest(app).get("/api/v1/me");
    const body = res.body as ErrorResponse;
    expect(res.headers["x-correlation-id"]).toBe(body.meta.correlationId);
  });

  it("422 response: X-Correlation-Id header === meta.correlationId", async () => {
    const res = await supertest(app).post("/echo").send({});
    const body = res.body as ErrorResponse;
    expect(res.headers["x-correlation-id"]).toBe(body.meta.correlationId);
  });

  it("500 response: X-Correlation-Id header === meta.correlationId", async () => {
    const res = await supertest(app).get("/fault");
    const body = res.body as ErrorResponse;
    expect(res.headers["x-correlation-id"]).toBe(body.meta.correlationId);
  });

  it("200 success response: X-Correlation-Id header is consistent across multiple requests", async () => {
    const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
    const res = await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-correlation-id"]).toMatch(UUID_RE);
  });
});

// ── criterion 8: structured auth.login_attempt log on every auth failure ─────

describe("Criterion 8 – structured console log with event = auth.login_attempt for every auth failure", () => {
  let app: ReturnType<typeof buildApp>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = buildApp();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function findAuthLog(
    calls: Parameters<typeof console.log>[][],
  ): Record<string, unknown> | undefined {
    const match = calls.find(
      (call) =>
        call.length > 0 &&
        typeof call[0] === "object" &&
        call[0] !== null &&
        (call[0] as Record<string, unknown>)["event"] === "auth.login_attempt",
    );
    return match ? (match[0] as Record<string, unknown>) : undefined;
  }

  it("missing token → structured log with event=auth.login_attempt and success=false", async () => {
    await supertest(app).get("/api/v1/me");
    const log = findAuthLog(consoleSpy.mock.calls);
    expect(log).toBeDefined();
    expect(log?.["success"]).toBe(false);
  });

  it("expired token → structured log with event=auth.login_attempt and success=false", async () => {
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${expired}`);
    const log = findAuthLog(consoleSpy.mock.calls);
    expect(log).toBeDefined();
    expect(log?.["success"]).toBe(false);
  });

  it("tampered token → structured log with event=auth.login_attempt and success=false", async () => {
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${tampered}`);
    const log = findAuthLog(consoleSpy.mock.calls);
    expect(log).toBeDefined();
    expect(log?.["success"]).toBe(false);
  });

  it("auth log contains the correlationId from the request", async () => {
    await supertest(app).get("/api/v1/me");
    const log = findAuthLog(consoleSpy.mock.calls);
    expect(log).toBeDefined();
    // correlationId in the log must be a UUID (injected by correlationId middleware)
    expect(log?.["correlationId"]).toMatch(UUID_RE);
  });

  it("auth log correlationId matches the X-Correlation-Id response header", async () => {
    const res = await supertest(app).get("/api/v1/me");
    const log = findAuthLog(consoleSpy.mock.calls);
    expect(log).toBeDefined();
    expect(log?.["correlationId"]).toBe(res.headers["x-correlation-id"]);
  });

  it("valid token → NO auth.login_attempt log emitted", async () => {
    const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
    await supertest(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);
    const log = findAuthLog(consoleSpy.mock.calls);
    expect(log).toBeUndefined();
  });
});

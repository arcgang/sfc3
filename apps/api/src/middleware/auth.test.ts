import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response } from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { correlationIdMiddleware } from "./correlationId.js";
import { authMiddleware } from "./auth.js";
import { errorHandler } from "./errorHandler.js";
import type { ErrorResponse } from "../types/errors.js";

const TEST_SECRET = "test-jwt-secret-for-middleware-tests";
const VALID_PAYLOAD = { sub: "user-001", email: "user@example.com" };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);

  const requireAuth = authMiddleware(TEST_SECRET);
  app.get("/api/v1/auth/me", requireAuth, (_req: Request, res: Response) => {
    res.json({ user: res.locals["user"] });
  });

  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Missing / malformed Authorization header → 401
// ---------------------------------------------------------------------------

describe("authMiddleware — missing or malformed Authorization header → 401", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns HTTP 401 when Authorization header is absent", async () => {
    const app = buildApp();
    const res = await supertest(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when Authorization header is absent", async () => {
    const app = buildApp();
    const res = await supertest(app).get("/api/v1/auth/me");
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("returns an empty error.details array when Authorization header is absent", async () => {
    const app = buildApp();
    const res = await supertest(app).get("/api/v1/auth/me");
    const body = res.body as ErrorResponse;
    expect(body.error.details).toEqual([]);
  });

  it("returns HTTP 401 when Authorization scheme is not Bearer", async () => {
    const app = buildApp();
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
  });

  it("returns HTTP 401 for a malformed token string", async () => {
    const app = buildApp();
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Expired token → 401
// ---------------------------------------------------------------------------

describe("authMiddleware — expired token → 401", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns HTTP 401 for an expired token", async () => {
    const app = buildApp();
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID for an expired token", async () => {
    const app = buildApp();
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("returns an empty error.details array for an expired token", async () => {
    const app = buildApp();
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    const body = res.body as ErrorResponse;
    expect(body.error.details).toEqual([]);
  });

  it("does not expose a stack trace in the response for an expired token", async () => {
    const app = buildApp();
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bError:/);
    expect(text).not.toMatch(/\bat /);
  });
});

// ---------------------------------------------------------------------------
// Tampered / wrong-secret token → 401
// ---------------------------------------------------------------------------

describe("authMiddleware — tampered token → 401", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns HTTP 401 for a token signed with the wrong secret", async () => {
    const app = buildApp();
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID for a tampered token", async () => {
    const app = buildApp();
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tampered}`);
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });

  it("does not expose a stack trace for a tampered token", async () => {
    const app = buildApp();
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tampered}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bError:/);
    expect(text).not.toMatch(/\bat /);
  });
});

// ---------------------------------------------------------------------------
// Structured security log emitted on every rejection
// ---------------------------------------------------------------------------

describe("authMiddleware — structured security log on every rejection", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("emits event=auth.login_attempt with success=false when token is absent", async () => {
    const app = buildApp();
    await supertest(app).get("/api/v1/auth/me");
    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const log = calls.find(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(log).toBeDefined();
    expect(log?.["success"]).toBe(false);
  });

  it("emits event=auth.login_attempt with success=false for an expired token", async () => {
    const app = buildApp();
    const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
    await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const log = calls.find(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(log).toBeDefined();
    expect(log?.["success"]).toBe(false);
  });

  it("emits event=auth.login_attempt with success=false for a tampered token", async () => {
    const app = buildApp();
    const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
    await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tampered}`);
    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const log = calls.find(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(log).toBeDefined();
    expect(log?.["success"]).toBe(false);
  });

  it("security log includes a correlationId field", async () => {
    const app = buildApp();
    await supertest(app).get("/api/v1/auth/me");
    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const log = calls.find(
      (arg) => typeof arg === "object" && arg["event"] === "auth.login_attempt",
    );
    expect(log).toBeDefined();
    expect(typeof log?.["correlationId"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Valid token → passes through to handler
// ---------------------------------------------------------------------------

describe("authMiddleware — valid token → request passes through", () => {
  it("returns HTTP 200 for a valid, unexpired token", async () => {
    const app = buildApp();
    const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("sets res.locals.user from the decoded token payload", async () => {
    const app = buildApp();
    const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
    const res = await supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    const body = res.body as { user: { sub: string; email: string } };
    expect(body.user.sub).toBe(VALID_PAYLOAD.sub);
    expect(body.user.email).toBe(VALID_PAYLOAD.email);
  });
});

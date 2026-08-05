import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-key-for-auth-middleware";
const VALID_PAYLOAD = { sub: "user-123", email: "user@example.com" };

// Import modules under test after we know the shape
import { authMiddleware } from "./auth.js";
import { correlationIdMiddleware } from "./correlationId.js";
import type { ErrorResponse } from "../types/errorResponse.js";

function makeApp(secret: string = TEST_SECRET) {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(authMiddleware(secret));
  app.get("/protected", (_req: Request, res: Response) => {
    res.json({ user: res.locals["user"] });
  });
  return app;
}

async function hitProtected(
  app: ReturnType<typeof makeApp>,
  authHeader?: string,
): Promise<{ status: number; body: unknown }> {
  const { default: supertest } = await import("supertest");
  const req = supertest(app).get("/protected");
  if (authHeader !== undefined) {
    req.set("Authorization", authHeader);
  }
  const res = await req;
  return { status: res.status, body: res.body };
}

describe("authMiddleware", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("missing Authorization header", () => {
    it("returns HTTP 401", async () => {
      const app = makeApp();
      const { status } = await hitProtected(app);
      expect(status).toBe(401);
    });

    it("returns error.type = AUTH_TOKEN_INVALID", async () => {
      const app = makeApp();
      const { body } = await hitProtected(app) as { body: ErrorResponse };
      expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
    });

    it("returns an empty error.details array", async () => {
      const app = makeApp();
      const { body } = await hitProtected(app) as { body: ErrorResponse };
      expect(body.error.details).toEqual([]);
    });

    it("returns meta.correlationId as a UUID", async () => {
      const app = makeApp();
      const { body } = await hitProtected(app) as { body: ErrorResponse };
      expect(body.meta.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("returns meta.timestamp as ISO 8601 UTC", async () => {
      const app = makeApp();
      const { body } = await hitProtected(app) as { body: ErrorResponse };
      expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
    });

    it("does not include a stack trace in the response body", async () => {
      const app = makeApp();
      const { body } = await hitProtected(app);
      expect(JSON.stringify(body)).not.toContain("at ");
    });

    it("emits a structured log with event = auth.login_attempt and success = false", async () => {
      const app = makeApp();
      await hitProtected(app);
      const calls = consoleSpy.mock.calls;
      const authLog = calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "auth.login_attempt",
      );
      expect(authLog).toBeDefined();
      if (!authLog) throw new Error("expected auth log");
      expect((authLog[0] as Record<string, unknown>)["success"]).toBe(false);
    });
  });

  describe("expired token", () => {
    it("returns HTTP 401", async () => {
      const app = makeApp();
      const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
      const { status } = await hitProtected(app, `Bearer ${expired}`);
      expect(status).toBe(401);
    });

    it("returns error.type = AUTH_TOKEN_INVALID", async () => {
      const app = makeApp();
      const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
      const { body } = await hitProtected(app, `Bearer ${expired}`) as { body: ErrorResponse };
      expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
    });

    it("emits a structured auth.login_attempt log with success = false", async () => {
      const app = makeApp();
      const expired = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: -1 });
      await hitProtected(app, `Bearer ${expired}`);
      const calls = consoleSpy.mock.calls;
      const authLog = calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "auth.login_attempt",
      );
      expect(authLog).toBeDefined();
      if (!authLog) throw new Error("expected auth log");
      expect((authLog[0] as Record<string, unknown>)["success"]).toBe(false);
    });
  });

  describe("tampered / invalid signature token", () => {
    it("returns HTTP 401", async () => {
      const app = makeApp();
      const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
      const { status } = await hitProtected(app, `Bearer ${tampered}`);
      expect(status).toBe(401);
    });

    it("returns error.type = AUTH_TOKEN_INVALID", async () => {
      const app = makeApp();
      const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
      const { body } = await hitProtected(app, `Bearer ${tampered}`) as { body: ErrorResponse };
      expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
    });

    it("emits a structured auth.login_attempt log with success = false", async () => {
      const app = makeApp();
      const tampered = jwt.sign(VALID_PAYLOAD, "wrong-secret");
      await hitProtected(app, `Bearer ${tampered}`);
      const calls = consoleSpy.mock.calls;
      const authLog = calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "auth.login_attempt",
      );
      expect(authLog).toBeDefined();
      if (!authLog) throw new Error("expected auth log");
      expect((authLog[0] as Record<string, unknown>)["success"]).toBe(false);
    });
  });

  describe("malformed token (not valid JWT structure)", () => {
    it("returns HTTP 401", async () => {
      const app = makeApp();
      const { status } = await hitProtected(app, "Bearer not-a-jwt-at-all");
      expect(status).toBe(401);
    });

    it("returns error.type = AUTH_TOKEN_INVALID", async () => {
      const app = makeApp();
      const { body } = await hitProtected(app, "Bearer not-a-jwt-at-all") as { body: ErrorResponse };
      expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
    });

    it("emits a structured auth.login_attempt log with success = false", async () => {
      const app = makeApp();
      await hitProtected(app, "Bearer not-a-jwt-at-all");
      const calls = consoleSpy.mock.calls;
      const authLog = calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "auth.login_attempt",
      );
      expect(authLog).toBeDefined();
      if (!authLog) throw new Error("expected auth log");
      expect((authLog[0] as Record<string, unknown>)["success"]).toBe(false);
    });
  });

  describe("valid token", () => {
    it("returns HTTP 200 and passes through to the handler", async () => {
      const app = makeApp();
      const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
      const { status } = await hitProtected(app, `Bearer ${token}`);
      expect(status).toBe(200);
    });

    it("attaches the decoded payload to res.locals.user", async () => {
      const app = makeApp();
      const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
      const { body } = await hitProtected(app, `Bearer ${token}`);
      const b = body as { user: { sub: string; email: string } };
      expect(b.user.sub).toBe(VALID_PAYLOAD.sub);
      expect(b.user.email).toBe(VALID_PAYLOAD.email);
    });

    it("does not emit an auth failure log on a valid token", async () => {
      const app = makeApp();
      const token = jwt.sign(VALID_PAYLOAD, TEST_SECRET, { expiresIn: "1h" });
      await hitProtected(app, `Bearer ${token}`);
      const calls = consoleSpy.mock.calls;
      const failureLog = calls.find(
        (call) =>
          typeof call[0] === "object" &&
          call[0] !== null &&
          (call[0] as Record<string, unknown>)["event"] === "auth.login_attempt" &&
          (call[0] as Record<string, unknown>)["success"] === false,
      );
      expect(failureLog).toBeUndefined();
    });
  });
});

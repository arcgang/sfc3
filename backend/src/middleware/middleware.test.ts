import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import supertest from "supertest";
import { correlationIdMiddleware } from "./correlationId.js";
import { errorHandler } from "./errorHandler.js";
import type { ErrorResponse } from "../types/errors.js";

function buildTestApp() {
  const app = express();
  app.use(correlationIdMiddleware);

  app.get("/ok", (_req: Request, res: Response) => {
    res.json({ message: "all good" });
  });

  app.get("/boom", (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error("something went wrong internally"));
  });

  app.use(errorHandler);
  return app;
}

describe("correlationId middleware", () => {
  it("sets X-Correlation-Id header on a normal response", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/ok");
    expect(res.headers["x-correlation-id"]).toBeDefined();
    expect(typeof res.headers["x-correlation-id"]).toBe("string");
    expect(res.headers["x-correlation-id"].length).toBeGreaterThan(0);
  });

  it("X-Correlation-Id is a valid UUID v4 format", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/ok");
    const uuid = res.headers["x-correlation-id"] as string;
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates a distinct correlation id per request", async () => {
    const app = buildTestApp();
    const [r1, r2] = await Promise.all([
      supertest(app).get("/ok"),
      supertest(app).get("/ok"),
    ]);
    expect(r1.headers["x-correlation-id"]).not.toBe(r2.headers["x-correlation-id"]);
  });
});

describe("errorHandler middleware", () => {
  it("returns HTTP 500 when an unhandled error is thrown", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/boom");
    expect(res.status).toBe(500);
  });

  it("error.type is INTERNAL_ERROR for unhandled errors", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/boom");
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("INTERNAL_ERROR");
  });

  it("response body conforms to ErrorResponse schema with required fields", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/boom");
    const body = res.body as ErrorResponse;

    expect(typeof body.meta.correlationId).toBe("string");
    expect(body.meta.correlationId.length).toBeGreaterThan(0);
    expect(typeof body.meta.timestamp).toBe("string");
    expect(() => new Date(body.meta.timestamp)).not.toThrow();
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);

    expect(typeof body.error.type).toBe("string");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("meta.correlationId matches X-Correlation-Id header in error response", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/boom");
    const body = res.body as ErrorResponse;
    expect(body.meta.correlationId).toBe(res.headers["x-correlation-id"]);
  });

  it("stack trace is not present in the error response body", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/boom");
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain("at ");
    expect(bodyText).not.toContain("Error:");
  });

  it("X-Correlation-Id header is present on error responses", async () => {
    const app = buildTestApp();
    const res = await supertest(app).get("/boom");
    expect(res.headers["x-correlation-id"]).toBeDefined();
  });
});

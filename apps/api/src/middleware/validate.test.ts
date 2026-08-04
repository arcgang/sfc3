import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { z } from "zod";
import { validateBody } from "./validate.js";
import type { ErrorResponse } from "../types/errors.js";

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

function buildApp() {
  const app = express();
  app.use(express.json());

  // Seed res.locals.correlationId like the real correlationId middleware would
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals["correlationId"] = "00000000-0000-0000-0000-000000000001";
    next();
  });

  app.post("/test", validateBody(testSchema), (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe("validateBody middleware", () => {
  it("returns 422 with REQUEST_VALIDATION_FAILED when body is missing required fields", async () => {
    const app = buildApp();
    const res = await request(app).post("/test").send({});

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns error.details with at least one entry containing code, message, and field", async () => {
    const app = buildApp();
    const res = await request(app).post("/test").send({});

    const body = res.body as ErrorResponse;
    expect(body.error.details.length).toBeGreaterThanOrEqual(1);
    const nameDetail = body.error.details.find((d) => d.field === "name");
    expect(nameDetail).toBeDefined();
    expect(nameDetail?.code).toBe("invalid_type");
    expect(nameDetail?.message).toBe("Invalid input: expected string, received undefined");
    expect(nameDetail?.field).toBe("name");
  });

  it("returns error.details with field set to the failing field path", async () => {
    const app = buildApp();
    const res = await request(app).post("/test").send({ name: "", age: 5 });

    const body = res.body as ErrorResponse;
    expect(body.error.details.length).toBeGreaterThanOrEqual(1);
    const nameDetail = body.error.details.find((d) => d.field === "name");
    expect(nameDetail).toBeDefined();
  });

  it("response conforms to ErrorResponse schema: meta has correlationId (UUID) and timestamp (ISO 8601 UTC)", async () => {
    const app = buildApp();
    const res = await request(app).post("/test").send({});

    const body = res.body as ErrorResponse;
    // correlationId must be a UUID pattern
    expect(body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    // timestamp must be ISO 8601 UTC (ends with Z or +00:00)
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  });

  it("calls next() and request passes through when body is valid", async () => {
    const app = buildApp();
    const res = await request(app).post("/test").send({ name: "Alice", age: 30 });

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it("returns 422 with correct error.type for wrong field type", async () => {
    const app = buildApp();
    const res = await request(app).post("/test").send({ name: "Alice", age: "not-a-number" });

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponse;
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
    const ageDetail = body.error.details.find((d) => d.field === "age");
    expect(ageDetail).toBeDefined();
  });
});

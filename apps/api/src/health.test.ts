import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import supertest from "supertest";
import http from "node:http";
import { health } from "./health.js";

// ── unit: health() function ──────────────────────────────────────────────────

describe("health()", () => {
  it("returns status 'ok'", () => {
    expect(health(0).status).toBe("ok");
  });

  it("returns the supplied uptimeSeconds", () => {
    expect(health(42).uptimeSeconds).toBe(42);
  });

  it("defaults uptimeSeconds to a non-negative integer from process.uptime()", () => {
    const result = health();
    expect(Number.isInteger(result.uptimeSeconds)).toBe(true);
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ── integration: GET /health via Express ─────────────────────────────────────

function buildTestApp() {
  const app = express();
  app.get("/health", (_req, res) => {
    res.json(health());
  });
  return app;
}

describe("GET /health", () => {
  const app = buildTestApp();

  it("returns HTTP 200", async () => {
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("returns Content-Type application/json", async () => {
    const res = await supertest(app).get("/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns body with status 'ok'", async () => {
    const res = await supertest(app).get("/health");
    expect((res.body as { status: string }).status).toBe("ok");
  });

  it("returns body with uptimeSeconds as a number", async () => {
    const res = await supertest(app).get("/health");
    const body = res.body as { status: string; uptimeSeconds: unknown };
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ── integration: GET /nonexistent returns 404 ────────────────────────────────

describe("GET /nonexistent", () => {
  const app = buildTestApp();

  it("returns HTTP 404 for an unregistered route", async () => {
    const res = await supertest(app).get("/nonexistent");
    expect(res.status).toBe(404);
  });
});

// ── integration: server binds to the configured port ─────────────────────────

describe("server binds to PORT", () => {
  let server: http.Server;
  let boundPort: number;

  beforeAll(async () => {
    const app = buildTestApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const addr = server.address();
    boundPort = addr !== null && typeof addr === "object" ? addr.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("binds to the assigned port and responds to HTTP requests", async () => {
    const res = await fetch(`http://127.0.0.1:${boundPort}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptimeSeconds: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);
const JWT_SECRET = "test-goals-secret";
const USER_ID = "user-goals-test-001";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "goals-api-test-"));
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function buildApp() {
  process.env.DB_PATH = join(tmpDir, "test.db");
  process.env.JWT_SECRET = JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { getDatabase } = await import("../db/connection.js");
  const db = getDatabase();

  // Seed a user so FK constraints pass
  db.prepare(
    "INSERT INTO users (id, email, password_hash, full_name, account_status) VALUES (?, ?, ?, ?, 'active')",
  ).run(USER_ID, "goals-test@example.com", "hashed", "Test User");

  const { correlationIdMiddleware } = await import(
    "../middleware/correlationId.js"
  );
  const { authMiddleware } = await import("../middleware/auth.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");
  const { goalsRouter } = await import("./goalsController.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/goals", authMiddleware(JWT_SECRET), goalsRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string = USER_ID) {
  return jwt.sign({ sub: userId, email: "goals-test@example.com" }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

// ---------------------------------------------------------------------------
// Successful goal creation
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — success", () => {
  it("returns HTTP 201 for a valid steps_daily goal", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
        startDate: "2026-07-21",
      });
    expect(res.status).toBe(201);
  });

  it("response body contains meta.correlationId as a UUID", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.body.meta.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("response body contains meta.timestamp as ISO 8601 UTC", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(new Date(res.body.meta.timestamp).toISOString()).toBe(
      res.body.meta.timestamp,
    );
  });

  it("response data.goal.goalType matches the request", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "sleep_minutes_daily",
        targetValue: 480,
        targetUnit: "minutes",
        cadence: "daily",
      });
    expect(res.body.data.goal.goalType).toBe("sleep_minutes_daily");
  });

  it("response data.goal.targetValue matches the request", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 8000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.body.data.goal.targetValue).toBe(8000);
  });

  it("response data.goal.targetUnit matches the request", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.body.data.goal.targetUnit).toBe("steps");
  });

  it("response data.goal.cadence matches the request", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "active_minutes_weekly",
        targetValue: 150,
        targetUnit: "minutes",
        cadence: "weekly",
      });
    expect(res.body.data.goal.cadence).toBe("weekly");
  });

  it("response data.goal.status is 'active'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.body.data.goal.status).toBe("active");
  });

  it("response data.goal.id is a UUID string", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.body.data.goal.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("response data.engagementEventRecorded is true", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.body.data.engagementEventRecorded).toBe(true);
  });

  it("persists the goal row with status='active' in the database", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "weight_target",
        targetValue: 70,
        targetUnit: "kg",
        cadence: "weekly",
      });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT status FROM goals WHERE id = ?")
      .get(res.body.data.goal.id) as { status: string } | undefined;
    expect(row?.status).toBe("active");
  });

  it("persists the goal row with user_id matching the authenticated user", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT user_id FROM goals WHERE id = ?")
      .get(res.body.data.goal.id) as { user_id: string } | undefined;
    expect(row?.user_id).toBe(USER_ID);
  });

  it("inserts an engagement_events row with event_type='goal_create'", async () => {
    const app = await buildApp();
    await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare(
        "SELECT event_type FROM engagement_events WHERE user_id = ? AND event_type = 'goal_create'",
      )
      .get(USER_ID) as { event_type: string } | undefined;
    expect(row?.event_type).toBe("goal_create");
  });

  it("engagement_events row user_id matches the authenticated user", async () => {
    const app = await buildApp();
    await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare(
        "SELECT user_id FROM engagement_events WHERE event_type = 'goal_create'",
      )
      .get() as { user_id: string } | undefined;
    expect(row?.user_id).toBe(USER_ID);
  });

  it("optional startDate is stored when provided", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
        startDate: "2026-07-21",
      });

    const { getDatabase } = await import("../db/connection.js");
    const db = getDatabase();
    const row = db
      .prepare("SELECT start_date FROM goals WHERE id = ?")
      .get(res.body.data.goal.id) as { start_date: string } | undefined;
    expect(row?.start_date).toBe("2026-07-21");
  });
});

// ---------------------------------------------------------------------------
// Authentication guard
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — auth guard", () => {
  it("returns HTTP 401 when no Authorization header is provided", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Validation: missing required fields
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — validation: missing fields", () => {
  it("returns HTTP 422 when goalType is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ targetValue: 10000, targetUnit: "steps", cadence: "daily" });
    expect(res.status).toBe(422);
  });

  it("returns error.type = REQUEST_VALIDATION_FAILED when goalType is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ targetValue: 10000, targetUnit: "steps", cadence: "daily" });
    expect(res.body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns HTTP 422 when targetValue is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ goalType: "steps_daily", targetUnit: "steps", cadence: "daily" });
    expect(res.status).toBe(422);
  });

  it("error.details contains a field entry for targetValue when it is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ goalType: "steps_daily", targetUnit: "steps", cadence: "daily" });
    const fields = (
      res.body.error.details as Array<{ field: string }>
    ).map((d) => d.field);
    expect(fields).toContain("targetValue");
  });

  it("returns HTTP 422 when cadence is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
      });
    expect(res.status).toBe(422);
  });

  it("error.details contains a field entry for cadence when it is missing", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
      });
    const fields = (
      res.body.error.details as Array<{ field: string }>
    ).map((d) => d.field);
    expect(fields).toContain("cadence");
  });
});

// ---------------------------------------------------------------------------
// Validation: invalid field values
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — validation: invalid values", () => {
  it("returns HTTP 422 for invalid goalType 'run_marathon'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "run_marathon",
        targetValue: 1,
        targetUnit: "event",
        cadence: "daily",
      });
    expect(res.status).toBe(422);
  });

  it("error.details contains field='goalType' for invalid goalType", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "run_marathon",
        targetValue: 1,
        targetUnit: "event",
        cadence: "daily",
      });
    const fields = (
      res.body.error.details as Array<{ field: string }>
    ).map((d) => d.field);
    expect(fields).toContain("goalType");
  });

  it("returns HTTP 422 for targetValue = 0", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 0,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 for negative targetValue", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: -100,
        targetUnit: "steps",
        cadence: "daily",
      });
    expect(res.status).toBe(422);
  });

  it("error.details contains field='targetValue' for targetValue = 0", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 0,
        targetUnit: "steps",
        cadence: "daily",
      });
    const fields = (
      res.body.error.details as Array<{ field: string }>
    ).map((d) => d.field);
    expect(fields).toContain("targetValue");
  });

  it("returns HTTP 422 for invalid cadence 'hourly'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "hourly",
      });
    expect(res.status).toBe(422);
  });

  it("error.details contains field='cadence' for invalid cadence", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "hourly",
      });
    const fields = (
      res.body.error.details as Array<{ field: string }>
    ).map((d) => d.field);
    expect(fields).toContain("cadence");
  });
});

// ---------------------------------------------------------------------------
// Validation: cadence inconsistent with goalType
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — validation: cadence inconsistent with goalType", () => {
  it("returns HTTP 422 for steps_daily with cadence='weekly'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "weekly",
      });
    expect(res.status).toBe(422);
  });

  it("error.details contains field='cadence' for steps_daily with cadence='weekly'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "weekly",
      });
    const fields = (
      res.body.error.details as Array<{ field: string }>
    ).map((d) => d.field);
    expect(fields).toContain("cadence");
  });

  it("returns HTTP 422 for active_minutes_weekly with cadence='daily'", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "active_minutes_weekly",
        targetValue: 150,
        targetUnit: "minutes",
        cadence: "daily",
      });
    expect(res.status).toBe(422);
  });

  it("accepts weight_target with either daily or weekly cadence", async () => {
    const app = await buildApp();
    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        goalType: "weight_target",
        targetValue: 70,
        targetUnit: "kg",
        cadence: "weekly",
      });
    expect(res.status).toBe(201);
  });
});

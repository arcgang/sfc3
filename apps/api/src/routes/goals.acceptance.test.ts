/**
 * Acceptance tests for the "Create wellness goals with validated targets" story.
 *
 * These tests exercise the seam between the tasks merged into this story:
 *   - apps/api foundation (Express routing, SQLite connection, goals + engagement_events schema)
 *   - POST /api/v1/goals and GET /api/v1/goals API endpoints
 *
 * Criterion numbers map to the story's acceptance criteria.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);
const TEST_JWT_SECRET = "test-jwt-secret-goals-acceptance";

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "goals-acceptance-test-"));
  }

  get tmpDir(): string {
    return this._tmpDir;
  }

  cleanup(): void {
    rmSync(this._tmpDir, { recursive: true, force: true });
  }
}

let ctx: TestContext;

beforeEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx = new TestContext();
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { goalsRouter } = await import("./goals.js");
  const { authMiddleware } = await import("../middleware/auth.js");
  const { correlationIdMiddleware } = await import("../middleware/correlationId.js");
  const { errorHandler } = await import("../middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/goals", authMiddleware(TEST_JWT_SECRET), goalsRouter);
  app.use(errorHandler);
  return app;
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId, email: `${userId}@example.com` }, TEST_JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function seedUser(dbPath: string, userId: string): Promise<void> {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
  db.close();
}

// ── Precondition: required schema tables exist after migration ─────────────────

describe("precondition: goals table exists in the schema", () => {
  it("goals table is present after running migrations", async () => {
    const dbPath = join(ctx.tmpDir, "pre-test.db");
    process.env.DB_PATH = dbPath;
    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'")
      .get() as { name: string } | undefined;
    db.close();

    expect(row?.name).toBe("goals");
  });
});

describe("precondition: engagement_events table exists in the schema", () => {
  it("engagement_events table is present after running migrations", async () => {
    const dbPath = join(ctx.tmpDir, "pre-test2.db");
    process.env.DB_PATH = dbPath;
    const { migrate } = await import("../db/migrate.js");
    migrate(MIGRATIONS_DIR);

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='engagement_events'",
      )
      .get() as { name: string } | undefined;
    db.close();

    expect(row?.name).toBe("engagement_events");
  });
});

// ── AC3: POST rejects invalid payloads with HTTP 422 and field-level details ──

describe("AC3: POST /api/v1/goals with missing targetValue returns 422", () => {
  it("returns HTTP 422 when targetValue is absent", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3a-u1");
    const token = makeToken("ac3a-u1");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("names 'targetValue' in field-level error details when targetValue is absent", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3a-u2");
    const token = makeToken("ac3a-u2");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "targetValue")).toBe(true);
  });
});

describe("AC3: POST /api/v1/goals with invalid goalType returns 422", () => {
  it("returns HTTP 422 when goalType is not in the allowed enum", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3b-u1");
    const token = makeToken("ac3b-u1");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "invalid_type", targetValue: 100, cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("names 'goalType' in field-level error details when goalType is invalid", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3b-u2");
    const token = makeToken("ac3b-u2");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "invalid_type", targetValue: 100, cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "goalType")).toBe(true);
  });
});

describe("AC3: POST /api/v1/goals with negative targetValue returns 422", () => {
  it("returns HTTP 422 when targetValue is -1", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3c-u1");
    const token = makeToken("ac3c-u1");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: -1, cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("names 'targetValue' in field-level error details when targetValue is -1", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3c-u2");
    const token = makeToken("ac3c-u2");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: -1, cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "targetValue")).toBe(true);
  });
});

describe("AC3: POST /api/v1/goals with cadence inconsistent with goalType returns 422", () => {
  it("returns HTTP 422 when steps_daily is submitted with cadence='weekly'", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3d-u1");
    const token = makeToken("ac3d-u1");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 10000, cadence: "weekly" });

    expect(res.status).toBe(422);
  });

  it("names 'cadence' in field-level error details when steps_daily is submitted with cadence='weekly'", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3d-u2");
    const token = makeToken("ac3d-u2");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 10000, cadence: "weekly" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "cadence")).toBe(true);
  });

  it("returns HTTP 422 when active_minutes_weekly is submitted with cadence='daily'", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3d-u3");
    const token = makeToken("ac3d-u3");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "active_minutes_weekly", targetValue: 150, cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("names 'cadence' in field-level error details when active_minutes_weekly is submitted with cadence='daily'", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac3d-u4");
    const token = makeToken("ac3d-u4");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "active_minutes_weekly", targetValue: 150, cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "cadence")).toBe(true);
  });
});

// ── AC4: Successful goal creation — full persistence round-trip ───────────────

describe("AC4: POST /api/v1/goals → GET returns goal with all supplied fields", () => {
  it("GET /goals returns goalType, targetValue, targetUnit, cadence, startDate, and status='active' for the created goal", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, "ac4-u1");
    const token = makeToken("ac4-u1");

    const postRes = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        goalType: "sleep_minutes_daily",
        targetValue: 480,
        targetUnit: "minutes",
        cadence: "daily",
        startDate: "2026-03-01",
      });

    expect(postRes.status).toBe(201);
    const createdId = (postRes.body as { data: { goal: { id: string } } }).data.goal.id;

    const getRes = await supertest(app)
      .get("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    const goals = (
      getRes.body as {
        data: {
          goals: Array<{
            id: string;
            goalType: string;
            targetValue: number;
            targetUnit: string;
            cadence: string;
            startDate: string;
            status: string;
          }>;
        };
      }
    ).data.goals;

    expect(goals.length).toBe(1);
    expect(goals[0]?.id).toBe(createdId);
    expect(goals[0]?.goalType).toBe("sleep_minutes_daily");
    expect(goals[0]?.targetValue).toBe(480);
    expect(goals[0]?.targetUnit).toBe("minutes");
    expect(goals[0]?.cadence).toBe("daily");
    expect(goals[0]?.startDate).toBe("2026-03-01");
    expect(goals[0]?.status).toBe("active");
  });

  it("created goal id matches the UUID format", async () => {
    const app = await buildApp();
    await seedUser(join(ctx.tmpDir, "test.db"), "ac4-u2");
    const token = makeToken("ac4-u2");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        goalType: "weight_target",
        targetValue: 75,
        cadence: "daily",
      });

    expect(res.status).toBe(201);
    const id = (res.body as { data: { goal: { id: string } } }).data.goal.id;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("goals table row has status='active' after POST for active_minutes_weekly", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, "ac4-u3");
    const token = makeToken("ac4-u3");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        goalType: "active_minutes_weekly",
        targetValue: 150,
        cadence: "weekly",
      });

    expect(res.status).toBe(201);
    const goalId = (res.body as { data: { goal: { id: string } } }).data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT status, goal_type, target_value, cadence FROM goals WHERE id = ?")
      .get(goalId) as {
      status: string;
      goal_type: string;
      target_value: number;
      cadence: string;
    } | undefined;
    db.close();

    expect(row?.status).toBe("active");
    expect(row?.goal_type).toBe("active_minutes_weekly");
    expect(row?.target_value).toBe(150);
    expect(row?.cadence).toBe("weekly");
  });

  it("start_date defaults to today when startDate is omitted from the request", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, "ac4-u4");
    const token = makeToken("ac4-u4");

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 8000, cadence: "daily" });

    expect(res.status).toBe(201);
    const goalId = (res.body as { data: { goal: { id: string } } }).data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT start_date FROM goals WHERE id = ?")
      .get(goalId) as { start_date: string } | undefined;
    db.close();

    // start_date should be a YYYY-MM-DD string (today)
    expect(row?.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── AC6: engagement_events row inserted with event_type='goal_create' ─────────

describe("AC6: POST /api/v1/goals inserts an engagement_events row with event_type='goal_create'", () => {
  it("engagement_events row exists with event_type='goal_create' after creating a steps_daily goal", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, "ac6-u1");
    const token = makeToken("ac6-u1");

    const postRes = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 10000, cadence: "daily" });

    expect(postRes.status).toBe(201);
    const goalId = (postRes.body as { data: { goal: { id: string } } }).data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT event_type, event_context_json FROM engagement_events WHERE user_id = ? AND event_type = 'goal_create'",
      )
      .get("ac6-u1") as { event_type: string; event_context_json: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.event_type).toBe("goal_create");
    const context = JSON.parse(row?.event_context_json ?? "{}") as { goalId: string };
    expect(context.goalId).toBe(goalId);
  });

  it("engagement_events row exists with event_type='goal_create' after creating a sleep_minutes_daily goal", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, "ac6-u2");
    const token = makeToken("ac6-u2");

    const postRes = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "sleep_minutes_daily", targetValue: 480, cadence: "daily" });

    expect(postRes.status).toBe(201);
    const goalId = (postRes.body as { data: { goal: { id: string } } }).data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT event_context_json FROM engagement_events WHERE user_id = ? AND event_type = 'goal_create'",
      )
      .get("ac6-u2") as { event_context_json: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    const context = JSON.parse(row?.event_context_json ?? "{}") as { goalId: string };
    expect(context.goalId).toBe(goalId);
  });

  it("goals table row and engagement_events row share the same goalId", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    await seedUser(dbPath, "ac6-u3");
    const token = makeToken("ac6-u3");

    const postRes = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "active_minutes_weekly", targetValue: 200, cadence: "weekly" });

    expect(postRes.status).toBe(201);
    const apiGoalId = (postRes.body as { data: { goal: { id: string } } }).data.goal.id;

    const db = new Database(dbPath);
    const eventRow = db
      .prepare(
        "SELECT event_context_json FROM engagement_events WHERE user_id = 'ac6-u3' AND event_type = 'goal_create'",
      )
      .get() as { event_context_json: string } | undefined;
    const goalRow = db
      .prepare("SELECT id FROM goals WHERE id = ?")
      .get(apiGoalId) as { id: string } | undefined;
    db.close();

    expect(goalRow?.id).toBe(apiGoalId);
    const context = JSON.parse(eventRow?.event_context_json ?? "{}") as { goalId: string };
    expect(context.goalId).toBe(apiGoalId);
  });
});

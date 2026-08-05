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
const TEST_JWT_SECRET = "test-jwt-secret-routes-goals";

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "routes-goals-test-"));
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

const VALID_PAYLOAD = {
  goalType: "steps_daily",
  targetValue: 10000,
  targetUnit: "steps",
  cadence: "daily",
};

// ---------------------------------------------------------------------------
// POST /api/v1/goals — validation: 422 cases
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — missing targetValue → 422", () => {
  it("returns HTTP 422 when targetValue is absent", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED when targetValue is absent", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", cadence: "daily" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns a field-level error detail identifying 'targetValue' when it is absent", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "targetValue")).toBe(true);
  });
});

describe("POST /api/v1/goals — invalid goalType → 422", () => {
  it("returns HTTP 422 when goalType is not in the allowed enum", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "run_marathon", targetValue: 1, cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'goalType' when it is invalid", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "run_marathon", targetValue: 1, cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "goalType")).toBe(true);
  });
});

describe("POST /api/v1/goals — negative targetValue → 422", () => {
  it("returns HTTP 422 when targetValue is negative", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: -500, cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("returns HTTP 422 when targetValue is zero", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-7";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 0, cadence: "daily" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'targetValue' when it is negative", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-8";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: -1, cadence: "daily" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "targetValue")).toBe(true);
  });
});

describe("POST /api/v1/goals — cadence inconsistent with goalType → 422", () => {
  it("returns 422 when steps_daily is paired with cadence='weekly'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-9";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 10000, cadence: "weekly" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'cadence' for cadence mismatch", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-10";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "steps_daily", targetValue: 10000, cadence: "weekly" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "cadence")).toBe(true);
  });

  it("returns 422 when sleep_minutes_daily is paired with cadence='weekly'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-11";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "sleep_minutes_daily", targetValue: 480, cadence: "weekly" });

    expect(res.status).toBe(422);
  });

  it("returns 422 when active_minutes_weekly is paired with cadence='daily'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-val-12";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "active_minutes_weekly", targetValue: 150, cadence: "daily" });

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/goals — success: 201 correct fields
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — valid payload → 201 correct fields", () => {
  it("returns HTTP 201 for a valid steps_daily goal", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
  });

  it("returns data.goal.goalType equal to the submitted goalType", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { goal: { goalType: string } } };
    expect(body.data.goal.goalType).toBe("steps_daily");
  });

  it("returns data.goal.targetValue equal to the submitted targetValue", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-3";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { goal: { targetValue: number } } };
    expect(body.data.goal.targetValue).toBe(10000);
  });

  it("returns data.goal.status equal to 'active'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-4";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { goal: { status: string } } };
    expect(body.data.goal.status).toBe("active");
  });

  it("returns data.goal.id as a UUID", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-5";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { goal: { id: string } } };
    expect(body.data.goal.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns data.goal.startDate equal to the submitted startDate", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-6";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD, startDate: "2026-01-15" });

    const body = res.body as { data: { goal: { startDate: string } } };
    expect(body.data.goal.startDate).toBe("2026-01-15");
  });

  it("persists the goal row with status='active' in the goals table", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-7";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { goal: { id: string } } };
    const goalId = body.data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT status, goal_type, target_value FROM goals WHERE id = ?")
      .get(goalId) as { status: string; goal_type: string; target_value: number } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.status).toBe("active");
    expect(row?.goal_type).toBe("steps_daily");
    expect(row?.target_value).toBe(10000);
  });

  it("weight_target accepts cadence='daily'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-8";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "weight_target", targetValue: 70, cadence: "daily" });

    expect(res.status).toBe(201);
  });

  it("weight_target accepts cadence='weekly'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-9";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "weight_target", targetValue: 70, cadence: "weekly" });

    expect(res.status).toBe(201);
  });

  it("stores the caller-supplied targetValue in the goals table, not a hardcoded constant", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-ok-10";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "active_minutes_weekly", targetValue: 300, cadence: "weekly" });

    const body = res.body as { data: { goal: { id: string } } };
    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT target_value FROM goals WHERE id = ?")
      .get(body.data.goal.id) as { target_value: number } | undefined;
    db.close();

    expect(row?.target_value).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/goals — valid payload → engagement_events row exists
// ---------------------------------------------------------------------------

describe("POST /api/v1/goals — valid payload → engagement_events row exists", () => {
  it("inserts an engagement_events row with event_type='goal_create'", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-evt-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const body = res.body as { data: { goal: { id: string } } };
    const goalId = body.data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT event_type, event_context_json FROM engagement_events WHERE user_id = ? AND event_type = 'goal_create'",
      )
      .get(userId) as { event_type: string; event_context_json: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.event_type).toBe("goal_create");

    const context = JSON.parse(row?.event_context_json ?? "{}") as { goalId: string };
    expect(context.goalId).toBe(goalId);
  });

  it("event_context_json contains the newly created goal's id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-evt-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goalType: "sleep_minutes_daily", targetValue: 480, cadence: "daily" });

    const body = res.body as { data: { goal: { id: string } } };
    const goalId = body.data.goal.id;

    const db = new Database(dbPath);
    const row = db
      .prepare(
        "SELECT event_context_json FROM engagement_events WHERE user_id = ? AND event_type = 'goal_create'",
      )
      .get(userId) as { event_context_json: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    const context = JSON.parse(row?.event_context_json ?? "{}") as { goalId: string };
    expect(context.goalId).toBe(goalId);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/goals — list goals
// ---------------------------------------------------------------------------

describe("GET /api/v1/goals", () => {
  it("returns HTTP 200 with an empty goals array when no goals exist", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-1";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { goals: unknown[] } };
    expect(body.data.goals).toEqual([]);
  });

  it("returns the created goal in data.goals after POST", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = "user-list-2";
    await seedUser(dbPath, userId);
    const token = makeToken(userId);

    await supertest(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PAYLOAD);

    const res = await supertest(app)
      .get("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { goals: Array<{ goalType: string; status: string }> };
    };
    expect(body.data.goals.length).toBe(1);
    expect(body.data.goals[0]?.goalType).toBe("steps_daily");
    expect(body.data.goals[0]?.status).toBe("active");
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const app = await buildApp();

    const res = await supertest(app).get("/api/v1/goals");

    expect(res.status).toBe(401);
  });
});

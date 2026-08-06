import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import supertest from "supertest";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "db/migrations",
);

const JWT_SECRET = "test-secret-for-profile-tests";

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "profile-test-"));
  }

  get tmpDir(): string {
    return this._tmpDir;
  }

  cleanup(): void {
    rmSync(this._tmpDir, { recursive: true, force: true });
  }
}

let ctx: TestContext;
let consoleSpy: MockInstance;

beforeEach(async () => {
  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();
  ctx = new TestContext();
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  const { resetDatabase } = await import("./db/connection.js");
  resetDatabase();
  ctx.cleanup();
  consoleSpy.mockRestore();
  delete process.env["DB_PATH"];
});

async function buildApp() {
  const dbPath = join(ctx.tmpDir, "test.db");
  process.env["DB_PATH"] = dbPath;

  const { migrate } = await import("./db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { profileRouter } = await import("./routes/profile.js");
  const { authMiddleware } = await import("./middleware/auth.js");
  const { correlationIdMiddleware } = await import(
    "./middleware/correlationId.js"
  );
  const { errorHandler } = await import("./middleware/errorHandler.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/profile", authMiddleware(JWT_SECRET), profileRouter);
  app.use(errorHandler);
  return app;
}

function seedUser(dbPath: string): string {
  const userId = "00000000-0000-0000-0000-000000000001";
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, account_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).run(userId, "test@example.com", "hashed", "Test User");
  db.close();
  return userId;
}

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "1h" });
}

const VALID_BODY = {
  fullName: "Sarah Chen",
  dateOfBirth: "1991-06-18",
  gender: "female",
  wellnessPreferences: ["steps", "sleep"],
};

// ---------------------------------------------------------------------------
// 200 on valid body — persists and returns profile
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — valid body → 200 and persisted", () => {
  it("returns HTTP 200 for a valid profile payload", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
  });

  it("returns data.profile.fullName matching the submitted fullName", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const body = res.body as { data: { profile: { fullName: string } } };
    expect(body.data.profile.fullName).toBe("Sarah Chen");
  });

  it("persists the fullName to the profiles table", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT full_name FROM profiles WHERE user_id = ?")
      .get(userId) as { full_name: string } | undefined;
    db.close();

    expect(row?.full_name).toBe("Sarah Chen");
  });

  it("persists the caller-supplied dateOfBirth to the profiles table", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT date_of_birth FROM profiles WHERE user_id = ?")
      .get(userId) as { date_of_birth: string } | undefined;
    db.close();

    expect(row?.date_of_birth).toBe("1991-06-18");
  });

  it("persists the caller-supplied gender to the profiles table", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT gender FROM profiles WHERE user_id = ?")
      .get(userId) as { gender: string } | undefined;
    db.close();

    expect(row?.gender).toBe("female");
  });

  it("persists the caller-supplied wellnessPreferences as JSON array in profiles table", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT wellness_preferences FROM profiles WHERE user_id = ?")
      .get(userId) as { wellness_preferences: string } | undefined;
    db.close();

    const parsed = JSON.parse(row?.wellness_preferences ?? "null") as unknown;
    expect(parsed).toEqual(["steps", "sleep"]);
  });

  it("returns meta.correlationId as a non-empty string", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const body = res.body as { meta: { correlationId: string } };
    expect(typeof body.meta.correlationId).toBe("string");
    expect(body.meta.correlationId.length).toBeGreaterThan(0);
  });

  it("returns data.profile.userId matching the authenticated user id", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const body = res.body as { data: { profile: { userId: string } } };
    expect(body.data.profile.userId).toBe(userId);
  });

  it("second PUT updates the existing profile row rather than inserting a duplicate", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, fullName: "Sarah Updated" });

    const db = new Database(dbPath);
    const rows = db
      .prepare("SELECT full_name FROM profiles WHERE user_id = ?")
      .all(userId) as Array<{ full_name: string }>;
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0]?.full_name).toBe("Sarah Updated");
  });

  it("emits a profile.updated console log on success", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    consoleSpy.mockClear();
    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const calls = consoleSpy.mock.calls.flat() as Array<Record<string, unknown>>;
    const hasEvent = calls.some(
      (arg) => typeof arg === "object" && arg["event"] === "profile.updated",
    );
    expect(hasEvent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 422 on missing / blank fullName
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — missing or blank fullName → 422", () => {
  it("returns HTTP 422 when fullName is absent", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateOfBirth: "1991-06-18" });

    expect(res.status).toBe(422);
  });

  it("returns a field-level error detail identifying 'fullName' when fullName is absent", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateOfBirth: "1991-06-18" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "fullName")).toBe(true);
  });

  it("returns HTTP 422 when fullName is an empty string", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "" });

    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED when fullName is absent", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });
});

// ---------------------------------------------------------------------------
// 401 on missing / invalid JWT
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — missing or invalid JWT → 401", () => {
  it("returns HTTP 401 when no Authorization header is sent", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .put("/api/v1/profile")
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  it("returns HTTP 401 when a malformed token is sent", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", "Bearer not.a.valid.jwt")
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  it("returns HTTP 401 when token is signed with a different secret", async () => {
    const app = await buildApp();

    const badToken = jwt.sign({ sub: "some-user" }, "wrong-secret", { expiresIn: "1h" });

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${badToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  it("returns HTTP 401 when token is expired", async () => {
    const app = await buildApp();

    const expiredToken = jwt.sign({ sub: "some-user" }, JWT_SECRET, { expiresIn: -1 });

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${expiredToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  it("returns error.type AUTH_TOKEN_INVALID when no token is provided", async () => {
    const app = await buildApp();

    const res = await supertest(app)
      .put("/api/v1/profile")
      .send(VALID_BODY);

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("AUTH_TOKEN_INVALID");
  });
});

// ---------------------------------------------------------------------------
// personaMode — valid values persisted and returned
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — personaMode valid values", () => {
  it("persists personaMode=fitness to profiles.persona_mode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "fitness" });

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT persona_mode FROM profiles WHERE user_id = ?")
      .get(userId) as { persona_mode: string } | undefined;
    db.close();

    expect(row?.persona_mode).toBe("fitness");
  });

  it("persists personaMode=elder_friendly to profiles.persona_mode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "elder_friendly" });

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT persona_mode FROM profiles WHERE user_id = ?")
      .get(userId) as { persona_mode: string } | undefined;
    db.close();

    expect(row?.persona_mode).toBe("elder_friendly");
  });

  it("persists personaMode=chronic_care_aware to profiles.persona_mode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "chronic_care_aware" });

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT persona_mode FROM profiles WHERE user_id = ?")
      .get(userId) as { persona_mode: string } | undefined;
    db.close();

    expect(row?.persona_mode).toBe("chronic_care_aware");
  });

  it("returns data.profile.personaMode matching the submitted value", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "fitness" });

    const body = res.body as { data: { profile: { personaMode: string } } };
    expect(body.data.profile.personaMode).toBe("fitness");
  });

  it("updates persona_mode on a second PUT when personaMode changes", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "fitness" });

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "elder_friendly" });

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT persona_mode FROM profiles WHERE user_id = ?")
      .get(userId) as { persona_mode: string } | undefined;
    db.close();

    expect(row?.persona_mode).toBe("elder_friendly");
  });
});

// ---------------------------------------------------------------------------
// personaMode — absent value defaults to 'default'
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — missing personaMode defaults to default", () => {
  it("stores persona_mode=default when personaMode is absent from the payload", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const db = new Database(dbPath);
    const row = db
      .prepare("SELECT persona_mode FROM profiles WHERE user_id = ?")
      .get(userId) as { persona_mode: string } | undefined;
    db.close();

    expect(row?.persona_mode).toBe("default");
  });

  it("returns data.profile.personaMode=default when personaMode is absent from the payload", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const body = res.body as { data: { profile: { personaMode: string } } };
    expect(body.data.profile.personaMode).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// personaMode — unrecognized value → 422 INVALID_ENUM
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — unrecognized personaMode → 422", () => {
  it("returns HTTP 422 when personaMode is an unrecognized value", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "ninja_mode" });

    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED for an unrecognized personaMode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "ninja_mode" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns an error detail with field=personaMode for an unrecognized personaMode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "ninja_mode" });

    const body = res.body as {
      error: { details: Array<{ field: string; code: string }> };
    };
    expect(body.error.details.some((d) => d.field === "personaMode")).toBe(true);
  });

  it("returns error detail code=INVALID_ENUM for an unrecognized personaMode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "ninja_mode" });

    const body = res.body as {
      error: { details: Array<{ field: string; code: string }> };
    };
    const detail = body.error.details.find((d) => d.field === "personaMode");
    expect(detail?.code).toBe("INVALID_ENUM");
  });
});

// ---------------------------------------------------------------------------
// 422 when fullName is below minimum length (1 character)
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — fullName too short → 422", () => {
  it("returns HTTP 422 when fullName is a single character", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "A" });

    expect(res.status).toBe(422);
  });

  it("returns error.type REQUEST_VALIDATION_FAILED when fullName is one character", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "X" });

    const body = res.body as { error: { type: string } };
    expect(body.error.type).toBe("REQUEST_VALIDATION_FAILED");
  });

  it("returns a field-level error detail identifying 'fullName' when fullName is too short", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Z" });

    const body = res.body as { error: { details: Array<{ field: string }> } };
    expect(body.error.details.some((d) => d.field === "fullName")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUT does not touch health_records
// ---------------------------------------------------------------------------

describe("PUT /api/v1/profile — health_records table untouched", () => {
  it("leaves the health_records table empty after a successful PUT", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "everyday_wellness" });

    const db = new Database(dbPath);
    const rows = db
      .prepare("SELECT COUNT(*) AS cnt FROM health_records WHERE user_id = ?")
      .get(userId) as { cnt: number };
    db.close();

    expect(rows.cnt).toBe(0);
  });

  it("does not modify pre-existing health_records rows after a successful PUT", async () => {
    // buildApp() must run first to apply migrations before seeding
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    // Seed a device_connection needed by health_records FK, then a health record
    const db = new Database(dbPath);
    const deviceId = "device-00000000-0000-0000-0000-000000000001";
    const recordId = "record-00000000-0000-0000-0000-000000000001";
    db.prepare(
      `INSERT INTO device_connections (id, user_id, device_type, connection_status, created_at, updated_at)
       VALUES (?, ?, 'smartwatch', 'connected', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).run(deviceId, userId);
    db.prepare(
      `INSERT INTO health_records (id, user_id, device_connection_id, metric_domain, source_type, metric_name, value, recorded_at, created_at, updated_at)
       VALUES (?, ?, ?, 'activity', 'smartwatch', 'steps', 8000, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).run(recordId, userId, deviceId);
    db.close();

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "active_fitness" });

    const db2 = new Database(dbPath);
    const row = db2
      .prepare("SELECT id, value FROM health_records WHERE id = ?")
      .get(recordId) as { id: string; value: number } | undefined;
    db2.close();

    expect(row).toBeDefined();
    expect(row!.id).toBe(recordId);
    expect(row!.value).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/profile — returns profile or defaults
// ---------------------------------------------------------------------------

describe("GET /api/v1/profile — no profile row → 200 with defaults", () => {
  it("returns HTTP 200 when no profile row exists yet", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("returns email from users table when no profile row exists", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { email: string } } };
    expect(body.data.profile.email).toBe("test@example.com");
  });

  it("returns personaMode 'everyday_wellness' as default when no profile row exists", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { personaMode: string } } };
    expect(body.data.profile.personaMode).toBe("everyday_wellness");
  });

  it("returns empty wellnessPreferences array as default when no profile row exists", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { wellnessPreferences: string[] } } };
    expect(body.data.profile.wellnessPreferences).toEqual([]);
  });
});

describe("GET /api/v1/profile — after PUT → reflects saved values", () => {
  it("returns HTTP 200 after PUT has created a profile", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "everyday_wellness" });

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("GET returns data.profile.fullName matching the previously PUT fullName", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "everyday_wellness" });

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { fullName: string } } };
    expect(body.data.profile.fullName).toBe("Sarah Chen");
  });

  it("GET returns data.profile.personaMode matching the previously PUT personaMode", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_BODY, personaMode: "active_fitness" });

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { personaMode: string } } };
    expect(body.data.profile.personaMode).toBe("active_fitness");
  });

  it("GET returns data.profile.email from users table", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { email: string } } };
    expect(body.data.profile.email).toBe("test@example.com");
  });

  it("GET returns data.profile.userId matching the authenticated user", async () => {
    const app = await buildApp();
    const dbPath = join(ctx.tmpDir, "test.db");
    const userId = seedUser(dbPath);
    const token = makeToken(userId);

    await supertest(app)
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_BODY);

    const res = await supertest(app)
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${token}`);

    const body = res.body as { data: { profile: { userId: string } } };
    expect(body.data.profile.userId).toBe(userId);
  });
});

describe("GET /api/v1/profile — no auth token → 401", () => {
  it("returns HTTP 401 when no Authorization header is sent", async () => {
    const app = await buildApp();

    const res = await supertest(app).get("/api/v1/profile");

    expect(res.status).toBe(401);
  });
});

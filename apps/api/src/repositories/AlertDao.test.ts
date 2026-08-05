import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

class TestContext {
  private readonly _tmpDir: string;

  constructor() {
    this._tmpDir = mkdtempSync(join(tmpdir(), "alert-dao-test-"));
  }

  get dbPath(): string {
    return join(this._tmpDir, "test.db");
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
  vi.resetModules();
});

afterEach(async () => {
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  ctx.cleanup();
  delete process.env["DB_PATH"];
});

async function buildDao() {
  process.env["DB_PATH"] = ctx.dbPath;
  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);
  const { getDatabase } = await import("../db/connection.js");
  const db = getDatabase();
  // Seed a user so FK constraints are satisfied
  db.prepare(
    "INSERT INTO users (id, email, password_hash) VALUES ('u1', 'u1@example.com', 'hash')",
  ).run();
  const { AlertDao } = await import("./AlertDao.js");
  return { dao: new AlertDao(db), db };
}

// ---------------------------------------------------------------------------
// Migration: alerts table exists with required columns
// ---------------------------------------------------------------------------

describe("alerts table schema", () => {
  it("alerts table exists after migration", async () => {
    const { db } = await buildDao();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alerts'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("alerts");
  });

  it("has all required columns: id, user_id, category, priority, message, rule_key, entity_id, entity_type, acknowledged, acknowledged_at, created_at", async () => {
    const { db } = await buildDao();
    const cols = db.pragma("table_info(alerts)") as { name: string }[];
    const names = cols.map((c) => c.name);
    for (const col of [
      "id",
      "user_id",
      "category",
      "priority",
      "message",
      "rule_key",
      "entity_id",
      "entity_type",
      "acknowledged",
      "acknowledged_at",
      "created_at",
    ]) {
      expect(names).toContain(col);
    }
  });

  it("acknowledged defaults to 0 on parameterless insert", async () => {
    const { db } = await buildDao();
    db.prepare(
      "INSERT INTO alerts (user_id, category, priority, message, created_at) VALUES ('u1', 'stale_data', 'medium', 'test', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    ).run();
    const row = db.prepare("SELECT acknowledged FROM alerts LIMIT 1").get() as {
      acknowledged: number;
    };
    expect(row.acknowledged).toBe(0);
  });

  it("CHECK constraint rejects an invalid category value 'invalid_cat'", async () => {
    const { db } = await buildDao();
    expect(() => {
      db.prepare(
        "INSERT INTO alerts (user_id, category, priority, message, created_at) VALUES ('u1', 'invalid_cat', 'medium', 'test', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
      ).run();
    }).toThrow();
  });

  it("CHECK constraint rejects an invalid priority value 'critical'", async () => {
    const { db } = await buildDao();
    expect(() => {
      db.prepare(
        "INSERT INTO alerts (user_id, category, priority, message, created_at) VALUES ('u1', 'stale_data', 'critical', 'test', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
      ).run();
    }).toThrow();
  });

  it("FK constraint rejects user_id='no-such-user' referencing a non-existent users row", async () => {
    const { db } = await buildDao();
    expect(() => {
      db.prepare(
        "INSERT INTO alerts (user_id, category, priority, message, created_at) VALUES ('no-such-user', 'stale_data', 'medium', 'test', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
      ).run();
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AlertDao.create
// ---------------------------------------------------------------------------

describe("AlertDao.create", () => {
  it("returns an alert with userId='u1'", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Smartwatch data is stale.",
    });
    expect(alert.userId).toBe("u1");
  });

  it("returns an alert with category='stale_data'", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Smartwatch data is stale.",
    });
    expect(alert.category).toBe("stale_data");
  });

  it("returns an alert with priority='medium'", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Smartwatch data is stale.",
    });
    expect(alert.priority).toBe("medium");
  });

  it("returns an alert with message='You are behind your daily steps goal.'", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "goal_risk",
      priority: "medium",
      message: "You are behind your daily steps goal.",
    });
    expect(alert.message).toBe("You are behind your daily steps goal.");
  });

  it("returns acknowledged=false on a newly created alert", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "sync_failure",
      priority: "medium",
      message: "Sync failed.",
    });
    expect(alert.acknowledged).toBe(false);
  });

  it("returns acknowledgedAt=null on a newly created alert", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "sync_failure",
      priority: "medium",
      message: "Sync failed.",
    });
    expect(alert.acknowledgedAt).toBeNull();
  });

  it("stores ruleKey='resting_heart_rate_bpm.high' when supplied", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "abnormal_reading",
      priority: "high",
      message: "Abnormal heart rate.",
      ruleKey: "resting_heart_rate_bpm.high",
    });
    expect(alert.ruleKey).toBe("resting_heart_rate_bpm.high");
  });

  it("stores entityId='goal-42' and entityType='goal' when supplied", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "goal_risk",
      priority: "medium",
      message: "Goal at risk.",
      entityId: "goal-42",
      entityType: "goal",
    });
    expect(alert.entityId).toBe("goal-42");
    expect(alert.entityType).toBe("goal");
  });

  it("persists the alert so a direct SELECT by id returns message='Scale data is stale.'", async () => {
    const { dao, db } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "low",
      message: "Scale data is stale.",
    });
    const row = db
      .prepare("SELECT message FROM alerts WHERE id = ?")
      .get(alert.id) as { message: string } | undefined;
    expect(row?.message).toBe("Scale data is stale.");
  });
});

// ---------------------------------------------------------------------------
// AlertDao.findByUser
// ---------------------------------------------------------------------------

describe("AlertDao.findByUser", () => {
  it("returns an empty array when no alerts exist for user 'u1'", async () => {
    const { dao } = await buildDao();
    expect(dao.findByUser("u1").length).toBe(0);
  });

  it("excludes the acknowledged alert when includeAcknowledged defaults to false", async () => {
    const { dao } = await buildDao();
    const a1 = dao.create({ userId: "u1", category: "stale_data", priority: "low", message: "A" });
    const a2 = dao.create({ userId: "u1", category: "goal_risk", priority: "medium", message: "B" });
    dao.acknowledge(a1.id, "u1");

    const alerts = dao.findByUser("u1");
    const ids = alerts.map((a) => a.id);
    expect(ids).not.toContain(a1.id);
    expect(ids).toContain(a2.id);
  });

  it("returns 2 alerts including acknowledged when includeAcknowledged=true", async () => {
    const { dao } = await buildDao();
    const a1 = dao.create({ userId: "u1", category: "stale_data", priority: "low", message: "A" });
    dao.acknowledge(a1.id, "u1");
    dao.create({ userId: "u1", category: "goal_risk", priority: "medium", message: "B" });

    expect(dao.findByUser("u1", true).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AlertDao.acknowledge
// ---------------------------------------------------------------------------

describe("AlertDao.acknowledge", () => {
  it("sets acknowledged=true on the alert after acknowledging id for user 'u1'", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Stale.",
    });
    const updated = dao.acknowledge(alert.id, "u1");
    expect(updated?.acknowledged).toBe(true);
  });

  it("sets a non-null acknowledgedAt ISO timestamp after acknowledgement", async () => {
    const { dao } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Stale.",
    });
    const updated = dao.acknowledge(alert.id, "u1");
    expect(updated?.acknowledgedAt).not.toBeNull();
  });

  it("does not delete the row after acknowledgement (row still exists in the database)", async () => {
    const { dao, db } = await buildDao();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Stale.",
    });
    dao.acknowledge(alert.id, "u1");
    const row = db.prepare("SELECT id FROM alerts WHERE id = ?").get(alert.id);
    expect(row).toBeDefined();
  });

  it("returns undefined when id=99999 does not exist", async () => {
    const { dao } = await buildDao();
    expect(dao.acknowledge(99999, "u1")).toBeUndefined();
  });

  it("does not acknowledge an alert belonging to user 'u2' when 'u1' owns it", async () => {
    const { dao, db } = await buildDao();
    db.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES ('u2', 'u2@example.com', 'hash')",
    ).run();
    const alert = dao.create({
      userId: "u1",
      category: "stale_data",
      priority: "medium",
      message: "Stale.",
    });
    dao.acknowledge(alert.id, "u2");
    const row = db
      .prepare("SELECT acknowledged FROM alerts WHERE id = ?")
      .get(alert.id) as { acknowledged: number };
    expect(row.acknowledged).toBe(0);
  });
});

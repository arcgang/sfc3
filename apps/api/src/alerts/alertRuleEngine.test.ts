import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

// ── Test helpers ──────────────────────────────────────────────────────────────

class TestContext {
  private _consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  startConsoleSpy(): void {
    this._consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  }

  get consoleSpy(): ReturnType<typeof vi.spyOn> {
    if (!this._consoleSpy) throw new Error("consoleSpy not started");
    return this._consoleSpy;
  }

  cleanup(): void {
    this._consoleSpy?.mockRestore();
  }

  /** Collect JSON-parsed console.log calls matching a given event name. */
  logsFor(event: string): Record<string, unknown>[] {
    return this.consoleSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse(call[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (entry): entry is Record<string, unknown> =>
          entry !== null && entry["event"] === event,
      );
  }
}

let ctx: TestContext;

beforeEach(async () => {
  process.env["DB_PATH"] = ":memory:";
  vi.resetModules();

  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  ctx = new TestContext();
  ctx.startConsoleSpy();
});

afterEach(async () => {
  ctx.cleanup();
  const { resetDatabase } = await import("../db/connection.js");
  resetDatabase();
  delete process.env["DB_PATH"];
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function getDb() {
  const { getDatabase } = await import("../db/connection.js");
  return getDatabase();
}

async function seedUser(userId: string): Promise<void> {
  const db = await getDb();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, ?, 'active')",
  ).run(userId, `${userId}@example.com`, "hashed");
}

async function seedDevice(
  userId: string,
  deviceId: string,
  deviceType: "smartwatch" | "smart_scale",
  lastSuccessfulSyncAt: string | null,
): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO device_connections
       (id, user_id, device_type, connection_status, connected_since, last_successful_sync_at)
     VALUES (?, ?, ?, 'connected', '2026-01-01T00:00:00Z', ?)`,
  ).run(deviceId, userId, deviceType, lastSuccessfulSyncAt);
}

async function seedSyncRun(
  deviceId: string,
  syncStatus: "started" | "succeeded" | "failed" | "partial_discard",
  startedAt: string,
): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO sync_runs (id, device_connection_id, sync_status, started_at)
     VALUES (?, ?, ?, ?)`,
  ).run(`sr-${deviceId}-${startedAt}`, deviceId, syncStatus, startedAt);
}

async function seedGoal(
  goalId: string,
  userId: string,
  goalType: string,
  targetValue: number,
  startDate: string,
  endDate: string | null = null,
  status = "active",
): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO goals
       (id, user_id, goal_type, target_value, target_unit, cadence, status, start_date, end_date)
     VALUES (?, ?, ?, ?, 'steps', 'daily', ?, ?, ?)`,
  ).run(goalId, userId, goalType, targetValue, status, startDate, endDate);
}

async function seedHealthRecord(
  recordId: string,
  userId: string,
  deviceId: string,
  metricName: string,
  value: number,
  recordedAt: string,
): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO health_records
       (id, user_id, device_connection_id, metric_domain, source_type, metric_name, value, recorded_at)
     VALUES (?, ?, ?, 'activity', 'smartwatch', ?, ?, ?)`,
  ).run(recordId, userId, deviceId, metricName, value, recordedAt);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluateAndPersist — stale_data rule", () => {
  it("fires when last_successful_sync_at is older than the config threshold", async () => {
    const userId = "user-stale-1";
    await seedUser(userId);
    // last sync 25 hours ago (threshold default is 18h)
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-stale-1", "smartwatch", staleTime);

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    expect(count).toBe(1);

    const row = db
      .prepare("SELECT category FROM alerts WHERE user_id = ?")
      .get(userId) as { category: string } | undefined;
    expect(row?.category).toBe("stale_data");
  });

  it("does NOT fire when the device was recently synced", async () => {
    const userId = "user-stale-2";
    await seedUser(userId);
    // last sync 1 hour ago — well within threshold
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-stale-2", "smartwatch", recentTime);

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    expect(count).toBe(0);
  });

  it("skips INSERT when an unacknowledged stale_data row already exists for the same entity", async () => {
    const userId = "user-stale-3";
    await seedUser(userId);
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-stale-3", "smartwatch", staleTime);

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();

    // First call inserts
    await evaluateAndPersist(userId, db);
    // Second call should deduplicate
    const count2 = await evaluateAndPersist(userId, db);

    expect(count2).toBe(0);

    const rows = db
      .prepare(
        "SELECT id FROM alerts WHERE user_id = ? AND category = 'stale_data'",
      )
      .all(userId) as { id: number }[];
    expect(rows.length).toBe(1);
  });
});

describe("evaluateAndPersist — sync_failure rule", () => {
  it("fires when the latest sync_runs row has sync_status='failed'", async () => {
    const userId = "user-sync-fail-1";
    await seedUser(userId);
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-sync-fail-1", "smartwatch", recentTime);
    await seedSyncRun("dev-sync-fail-1", "failed", "2026-07-21T14:00:00Z");

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    expect(count).toBeGreaterThanOrEqual(1);

    const row = db
      .prepare(
        "SELECT category FROM alerts WHERE user_id = ? AND category = 'sync_failure'",
      )
      .get(userId) as { category: string } | undefined;
    expect(row?.category).toBe("sync_failure");
  });

  it("does NOT fire when the latest sync_runs row has sync_status='succeeded'", async () => {
    const userId = "user-sync-fail-2";
    await seedUser(userId);
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-sync-fail-2", "smartwatch", recentTime);
    await seedSyncRun("dev-sync-fail-2", "succeeded", "2026-07-21T14:00:00Z");

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    expect(count).toBe(0);

    const row = db
      .prepare(
        "SELECT id FROM alerts WHERE user_id = ? AND category = 'sync_failure'",
      )
      .get(userId);
    expect(row).toBeUndefined();
  });
});

describe("evaluateAndPersist — goal_risk rule", () => {
  it("fires when currentValue < expectedProgress * goalRiskThreshold", async () => {
    const userId = "user-goal-risk-1";
    await seedUser(userId);
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-goal-1", "smartwatch", recentTime);

    // Goal started 15 days ago, 30 day window, target 10000 steps
    const startDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] as string;
    const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] as string;
    await seedGoal("goal-gr-1", userId, "steps_daily", 10000, startDate, endDate);

    // expectedProgress = 10000 * (15/30) = 5000; goal_risk=0.75 → threshold = 3750
    // seed 1000 steps → well below threshold
    await seedHealthRecord(
      "hr-goal-1",
      userId,
      "dev-goal-1",
      "steps",
      1000,
      "2026-07-21T10:00:00Z",
    );

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    expect(count).toBeGreaterThanOrEqual(1);

    const row = db
      .prepare(
        "SELECT category, entity_id FROM alerts WHERE user_id = ? AND category = 'goal_risk'",
      )
      .get(userId) as { category: string; entity_id: string } | undefined;
    expect(row?.category).toBe("goal_risk");
    expect(row?.entity_id).toBe("goal-gr-1");
  });

  it("does NOT fire when the goal is on track", async () => {
    const userId = "user-goal-risk-2";
    await seedUser(userId);
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-goal-2", "smartwatch", recentTime);

    // Goal started 15 days ago, 30 day window, target 10000 steps
    const startDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] as string;
    const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] as string;
    await seedGoal("goal-gr-2", userId, "steps_daily", 10000, startDate, endDate);

    // expectedProgress = 5000; goal_risk threshold = 3750; seed 9000 steps → on track
    await seedHealthRecord(
      "hr-goal-2",
      userId,
      "dev-goal-2",
      "steps",
      9000,
      "2026-07-21T10:00:00Z",
    );

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    expect(count).toBe(0);
  });
});

describe("evaluateAndPersist — abnormal_reading rule", () => {
  it("fires when metric value exceeds configured max threshold", async () => {
    const userId = "user-abnormal-1";
    await seedUser(userId);
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-abnormal-1", "smartwatch", recentTime);

    process.env["ALERT_ABNORMAL_THRESHOLDS_JSON"] = JSON.stringify({
      resting_heart_rate_bpm: { min: 40, max: 100 },
    });

    await seedHealthRecord(
      "hr-abnormal-1",
      userId,
      "dev-abnormal-1",
      "resting_heart_rate_bpm",
      130,
      "2026-07-21T10:00:00Z",
    );

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    const count = await evaluateAndPersist(userId, db);

    delete process.env["ALERT_ABNORMAL_THRESHOLDS_JSON"];

    expect(count).toBeGreaterThanOrEqual(1);

    const row = db
      .prepare(
        "SELECT category FROM alerts WHERE user_id = ? AND category = 'abnormal_reading'",
      )
      .get(userId) as { category: string } | undefined;
    expect(row?.category).toBe("abnormal_reading");
  });
});

describe("evaluateAndPersist — priority assignment", () => {
  it("assigns priority='high' when all devices are stale (2 of 2)", async () => {
    const userId = "user-priority-all-stale";
    await seedUser(userId);
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-p-1", "smartwatch", staleTime);
    await seedDevice(userId, "dev-p-2", "smart_scale", staleTime);

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    await evaluateAndPersist(userId, db);

    const rows = db
      .prepare("SELECT priority FROM alerts WHERE user_id = ?")
      .all(userId) as { priority: string }[];

    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.priority).toBe("high");
    }
  });

  it("assigns priority='medium' when only 1 of 2 devices is stale", async () => {
    const userId = "user-priority-one-stale";
    await seedUser(userId);
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-p-3", "smartwatch", staleTime);
    await seedDevice(userId, "dev-p-4", "smart_scale", recentTime);

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    await evaluateAndPersist(userId, db);

    const rows = db
      .prepare("SELECT priority FROM alerts WHERE user_id = ?")
      .all(userId) as { priority: string }[];

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.priority).toBe("medium");
    }
  });

  it("assigns priority='high' for abnormal_reading with no stale devices", async () => {
    const userId = "user-priority-abnormal";
    await seedUser(userId);
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-p-5", "smartwatch", recentTime);

    process.env["ALERT_ABNORMAL_THRESHOLDS_JSON"] = JSON.stringify({
      resting_heart_rate_bpm: { min: 40, max: 100 },
    });

    await seedHealthRecord(
      "hr-priority-1",
      userId,
      "dev-p-5",
      "resting_heart_rate_bpm",
      130,
      "2026-07-21T10:00:00Z",
    );

    const { evaluateAndPersist } = await import("./alertRuleEngine.js");
    const db = await getDb();
    await evaluateAndPersist(userId, db);

    delete process.env["ALERT_ABNORMAL_THRESHOLDS_JSON"];

    const row = db
      .prepare(
        "SELECT priority FROM alerts WHERE user_id = ? AND category = 'abnormal_reading'",
      )
      .get(userId) as { priority: string } | undefined;

    expect(row?.priority).toBe("high");
  });
});

describe("acknowledgeAlert", () => {
  it("sets acknowledged=1 on the row and emits alerts.acknowledged console event", async () => {
    const userId = "user-ack-engine-1";
    await seedUser(userId);
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await seedDevice(userId, "dev-ack-1", "smartwatch", staleTime);

    const { evaluateAndPersist, acknowledgeAlert } = await import(
      "./alertRuleEngine.js"
    );
    const db = await getDb();
    await evaluateAndPersist(userId, db);

    const alertRow = db
      .prepare("SELECT id FROM alerts WHERE user_id = ? LIMIT 1")
      .get(userId) as { id: number } | undefined;
    expect(alertRow).toBeDefined();
    if (!alertRow) throw new Error("no alert seeded");

    await acknowledgeAlert(alertRow.id, userId, db);

    const updated = db
      .prepare("SELECT acknowledged, acknowledged_at FROM alerts WHERE id = ?")
      .get(alertRow.id) as
      | { acknowledged: number; acknowledged_at: string }
      | undefined;
    expect(updated?.acknowledged).toBe(1);
    expect(updated?.acknowledged_at).not.toBeNull();

    const ackLogs = ctx.logsFor("alerts.acknowledged");
    expect(ackLogs.length).toBe(1);
    expect(ackLogs[0]?.["alert_id"]).toBe(alertRow.id);
    expect(ackLogs[0]?.["user_id"]).toBe(userId);
  });

  it("throws an error with code='RESOURCE_NOT_FOUND' for an unknown alertId", async () => {
    const userId = "user-ack-engine-2";
    await seedUser(userId);

    const { acknowledgeAlert } = await import("./alertRuleEngine.js");
    const db = await getDb();

    await expect(acknowledgeAlert(99999, userId, db)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

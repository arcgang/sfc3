import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

const ALL_TABLES = [
  "users",
  "profiles",
  "device_connections",
  "sync_runs",
  "health_records",
  "goals",
  "alerts",
  "insights",
  "engagement_events",
  "partner_services",
  "privacy_requests",
];

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "schema-test-"));
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: open fresh in-memory DB, run real migrate(), return db
async function openMigratedDb(): Promise<Database.Database> {
  process.env.DB_PATH = ":memory:";
  const { migrate } = await import("./migrate.js");
  migrate(MIGRATIONS_DIR);
  const { getDatabase } = await import("./connection.js");
  return getDatabase();
}

// ---------------------------------------------------------------------------
// (a) All 11 tables exist after migrate()
// ---------------------------------------------------------------------------

describe("schema: all 11 tables created", () => {
  it("creates every required table in sqlite_master", async () => {
    const db = await openMigratedDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);

    for (const table of ALL_TABLES) {
      expect(names).toContain(table);
    }
    // Exactly 11 domain tables (excluding the _migrations runner table)
    const userTables = names.filter((n) => !n.startsWith("sqlite_") && n !== "_migrations");
    expect(userTables).toHaveLength(11);

    delete process.env.DB_PATH;
  });
});

// ---------------------------------------------------------------------------
// (b) CHECK constraints fire on invalid enum values
// ---------------------------------------------------------------------------

describe("schema: CHECK constraints on enum columns", () => {
  it("rejects account_status = 'banned' on users", async () => {
    const db = await openMigratedDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','banned')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("accepts valid account_status values on users", async () => {
    const db = await openMigratedDb();
    for (const [i, status] of (["active", "locked", "pending_verification"] as const).entries()) {
      expect(() =>
        db
          .prepare(
            "INSERT INTO users (id, email, password_hash, account_status) VALUES (?, ?, 'h', ?)",
          )
          .run(`u${i}`, `u${i}@b.com`, status),
      ).not.toThrow();
    }
    delete process.env.DB_PATH;
  });

  it("rejects persona_mode = 'invalid_mode' on profiles", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO profiles (id, user_id, persona_mode) VALUES ('p1','u1','invalid_mode')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects device_type = 'treadmill' on device_connections", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','treadmill','connected')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects connection_status = 'unknown' on device_connections", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','smartwatch','unknown')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects sync_status = 'pending' on sync_runs", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    db.prepare("INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','smartwatch','connected')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO sync_runs (id, device_connection_id, sync_status, started_at) VALUES ('s1','d1','pending','2025-01-01T00:00:00Z')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects metric_domain = 'mood' on health_records", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    db.prepare("INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','smartwatch','connected')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO health_records (id, user_id, device_connection_id, metric_domain, source_type, metric_name, value, recorded_at) VALUES ('r1','u1','d1','mood','smartwatch','steps',100,'2025-01-01T00:00:00Z')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects source_type = 'bluetooth_scale' on health_records", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    db.prepare("INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','smartwatch','connected')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO health_records (id, user_id, device_connection_id, metric_domain, source_type, metric_name, value, recorded_at) VALUES ('r1','u1','d1','vitals','bluetooth_scale','steps',100,'2025-01-01T00:00:00Z')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects goal_type = 'run_marathon' on goals", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO goals (id, user_id, goal_type, cadence, status) VALUES ('g1','u1','run_marathon','daily','active')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects cadence = 'hourly' on goals", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO goals (id, user_id, goal_type, cadence, status) VALUES ('g1','u1','steps_daily','hourly','active')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects status = 'cancelled' on goals", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO goals (id, user_id, goal_type, cadence, status) VALUES ('g1','u1','steps_daily','daily','cancelled')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects category = 'reminder' on alerts", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO alerts (id, user_id, category, priority, message) VALUES ('a1','u1','reminder','high','msg')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects priority = 'critical' on alerts", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO alerts (id, user_id, category, priority, message) VALUES ('a1','u1','stale_data','critical','msg')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects insight_type = 'prediction' on insights", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO insights (id, user_id, insight_type, generator_name, content) VALUES ('i1','u1','prediction','Recommendation Engine','text')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects generator_name = 'Unknown Generator' on insights", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO insights (id, user_id, insight_type, generator_name, content) VALUES ('i1','u1','nudge','Unknown Generator','text')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects event_type = 'page_load' on engagement_events", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO engagement_events (id, user_id, event_type, occurred_at) VALUES ('e1','u1','page_load','2025-01-01T00:00:00Z')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects marketplace_status = 'active' on partner_services", async () => {
    const db = await openMigratedDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO partner_services (id, name, marketplace_status) VALUES ('ps1','Acme','active')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects request_type = 'anonymize' on privacy_requests", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO privacy_requests (id, user_id, request_type, request_status) VALUES ('pr1','u1','anonymize','requested')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("rejects request_status = 'pending' on privacy_requests", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO privacy_requests (id, user_id, request_type, request_status) VALUES ('pr1','u1','export','pending')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });
});

// ---------------------------------------------------------------------------
// (c) UNIQUE constraint on device_connections(user_id, device_type)
// ---------------------------------------------------------------------------

describe("schema: UNIQUE(user_id, device_type) on device_connections", () => {
  it("rejects a second row with the same user_id and device_type", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    db.prepare("INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','smartwatch','connected')").run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d2','u1','smartwatch','disconnected')",
        )
        .run(),
    ).toThrow();
    delete process.env.DB_PATH;
  });

  it("allows the same user_id with different device_type", async () => {
    const db = await openMigratedDb();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','a@b.com','h','active')").run();
    expect(() => {
      db.prepare("INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d1','u1','smartwatch','connected')").run();
      db.prepare("INSERT INTO device_connections (id, user_id, device_type, connection_status) VALUES ('d2','u1','smart_scale','connected')").run();
    }).not.toThrow();
    delete process.env.DB_PATH;
  });
});

// ---------------------------------------------------------------------------
// (d) Idempotency: second migrate() call does not error and does not lose rows
// ---------------------------------------------------------------------------

describe("schema: idempotency — migrate() is safe to run twice", () => {
  it("does not error on a second migrate() call", async () => {
    process.env.DB_PATH = ":memory:";
    const { migrate } = await import("./migrate.js");

    expect(() => migrate(MIGRATIONS_DIR)).not.toThrow();
    expect(() => migrate(MIGRATIONS_DIR)).not.toThrow();

    delete process.env.DB_PATH;
  });

  it("preserves rows inserted between the first and second migrate() call", async () => {
    process.env.DB_PATH = ":memory:";
    const { migrate } = await import("./migrate.js");
    const { getDatabase } = await import("./connection.js");

    migrate(MIGRATIONS_DIR);
    const db = getDatabase();
    db.prepare("INSERT INTO users (id, email, password_hash, account_status) VALUES ('u1','keep@me.com','h','active')").run();

    // Second run must not drop or truncate the table
    migrate(MIGRATIONS_DIR);

    const row = db.prepare("SELECT email FROM users WHERE id = 'u1'").get() as { email: string } | undefined;
    expect(row?.email).toBe("keep@me.com");

    delete process.env.DB_PATH;
  });
});

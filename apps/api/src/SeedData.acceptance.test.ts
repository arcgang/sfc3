/**
 * Acceptance tests for the "Seed Data" story.
 *
 * Criterion 1: Seed data covers all functions and capabilities
 * Criterion 2: Seeding script is created
 * Criterion 3: README.md documents how to run the seeding script
 *
 * Tests exercise the SEAM between the two merged tasks:
 *   - apps/api/src/db/seed.ts (the comprehensive seed script)
 *   - README.md at the repo root (the run instructions)
 *
 * The database tests run the actual seed.ts script end-to-end against a
 * real SQLite database so a missing migration, a missing table, or an absent
 * data category all cause loud failures rather than silent passes.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(THIS_DIR, "..");
const REPO_ROOT = join(THIS_DIR, "../../..");

// ── query helpers ─────────────────────────────────────────────────────────────

function rowCount(db: Database.Database, table: string, where?: string): number {
  const sql = `SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  return (db.prepare(sql).get() as { n: number }).n;
}

function distinctValues(db: Database.Database, table: string, column: string): string[] {
  return (
    db
      .prepare(`SELECT DISTINCT ${column} FROM ${table} ORDER BY ${column}`)
      .all() as Record<string, string>[]
  ).map((r) => r[column] as string);
}

// ── Criterion 1: seed data covers all functions and capabilities ──────────────

describe("Criterion 1 – seed data covers all functions and capabilities", () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeAll(async () => {
    // Precondition: the seed source file and migration directory must both exist
    // before we can make any behavioural assertions about the seeded data.
    expect(
      existsSync(join(THIS_DIR, "db", "seed.ts")),
      "apps/api/src/db/seed.ts must exist",
    ).toBe(true);
    expect(
      existsSync(join(THIS_DIR, "db", "migrations")),
      "apps/api/src/db/migrations directory must exist",
    ).toBe(true);

    tmpDir = mkdtempSync(join(tmpdir(), "seed-acc-c1-"));
    const dbPath = join(tmpDir, "test.db");

    // Import order matters: reset module cache so each describe block gets its
    // own singleton DB instance pointed at the temp file.
    vi.resetModules();
    process.env["DB_PATH"] = dbPath;

    // Run the actual seed script end-to-end (imports run all top-level code).
    await import("./db/seed.js");

    const { getDatabase } = await import("./db/connection.js");
    db = getDatabase();

    // Precondition: migrations ran and populated the _migrations table.
    const migrationCount = rowCount(db, "_migrations");
    expect(migrationCount, "_migrations table must have at least one applied migration").toBeGreaterThan(0);
  });

  afterAll(async () => {
    const { resetDatabase } = await import("./db/connection.js");
    resetDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env["DB_PATH"];
  });

  // ── users ───────────────────────────────────────────────────────────────────

  it("demo user 'demo@wellnesshub.com' is present with 'active' account_status", () => {
    // Precondition: users table has data
    expect(rowCount(db, "users")).toBeGreaterThan(0);

    const user = db
      .prepare("SELECT account_status FROM users WHERE email = 'demo@wellnesshub.com'")
      .get() as { account_status: string } | undefined;
    expect(user).toBeDefined();
    expect(user?.account_status).toBe("active");
  });

  it("six persona-mode users (demo-*@wellnesshub.com) are seeded — one per mode", () => {
    const c = rowCount(db, "users", "email LIKE 'demo-%@wellnesshub.com'");
    expect(c).toBe(6);
  });

  // ── profiles ────────────────────────────────────────────────────────────────

  it("profiles table covers all six persona_mode values exactly", () => {
    // Precondition: profiles table has data
    expect(rowCount(db, "profiles")).toBeGreaterThan(0);

    const modes = distinctValues(db, "profiles", "persona_mode");
    expect(modes).toEqual([
      "active_fitness",
      "chronic_care_aware",
      "default",
      "elder_friendly",
      "everyday_wellness",
      "fitness",
    ]);
  });

  // ── device connections ───────────────────────────────────────────────────────

  it("device_connections has exactly one 'smartwatch' connection", () => {
    expect(rowCount(db, "device_connections")).toBeGreaterThan(0);
    expect(rowCount(db, "device_connections", "device_type = 'smartwatch'")).toBe(1);
  });

  it("device_connections has exactly one 'smart_scale' connection", () => {
    expect(rowCount(db, "device_connections", "device_type = 'smart_scale'")).toBe(1);
  });

  it("device_connections has both 'connected' and 'disconnected' statuses", () => {
    const statuses = distinctValues(db, "device_connections", "connection_status");
    expect(statuses).toContain("connected");
    expect(statuses).toContain("disconnected");
  });

  // ── sync runs ────────────────────────────────────────────────────────────────

  it("sync_runs has a 'succeeded' run linked to the smartwatch", () => {
    expect(rowCount(db, "sync_runs")).toBeGreaterThan(0);
    expect(rowCount(db, "sync_runs", "sync_status = 'succeeded'")).toBe(1);
  });

  it("sync_runs has a 'failed' run with an error_message", () => {
    const row = db
      .prepare("SELECT error_message FROM sync_runs WHERE sync_status = 'failed'")
      .get() as { error_message: string | null } | undefined;
    expect(row).toBeDefined();
    expect(typeof row?.error_message).toBe("string");
    expect((row?.error_message ?? "").length).toBeGreaterThan(0);
  });

  // ── health records ────────────────────────────────────────────────────────────

  it("health_records covers 'vitals' metric_domain with 14 days of data", () => {
    expect(rowCount(db, "health_records")).toBeGreaterThan(0);
    expect(rowCount(db, "health_records", "metric_domain = 'vitals'")).toBe(14);
  });

  it("health_records covers 'activity' metric_domain — steps + active_minutes × 14 days = 28 rows", () => {
    expect(rowCount(db, "health_records", "metric_domain = 'activity'")).toBe(28);
  });

  it("health_records covers 'sleep' metric_domain with 14 days of data", () => {
    expect(rowCount(db, "health_records", "metric_domain = 'sleep'")).toBe(14);
  });

  it("health_records covers 'body_composition' metric_domain with 14 days of data", () => {
    expect(rowCount(db, "health_records", "metric_domain = 'body_composition'")).toBe(14);
  });

  // ── goals ─────────────────────────────────────────────────────────────────────

  it("goals table has exactly one 'steps_daily' goal", () => {
    expect(rowCount(db, "goals")).toBeGreaterThan(0);
    expect(rowCount(db, "goals", "goal_type = 'steps_daily'")).toBe(1);
  });

  it("goals table has exactly one 'sleep_minutes_daily' goal", () => {
    expect(rowCount(db, "goals", "goal_type = 'sleep_minutes_daily'")).toBe(1);
  });

  it("goals table has exactly one 'weight_target' goal", () => {
    expect(rowCount(db, "goals", "goal_type = 'weight_target'")).toBe(1);
  });

  it("goals table has exactly one 'active_minutes_weekly' goal", () => {
    expect(rowCount(db, "goals", "goal_type = 'active_minutes_weekly'")).toBe(1);
  });

  it("goals table has both 'daily' and 'weekly' cadences", () => {
    const cadences = distinctValues(db, "goals", "cadence");
    expect(cadences).toContain("daily");
    expect(cadences).toContain("weekly");
  });

  // ── goal insights ─────────────────────────────────────────────────────────────

  it("goal_insights table has exactly 2 AI-generated recommendations", () => {
    expect(rowCount(db, "goal_insights")).toBe(2);
  });

  // ── alerts ─────────────────────────────────────────────────────────────────────

  it("alerts table has exactly one 'stale_data' alert", () => {
    expect(rowCount(db, "alerts")).toBeGreaterThan(0);
    expect(rowCount(db, "alerts", "category = 'stale_data'")).toBe(1);
  });

  it("alerts table has exactly one 'abnormal_reading' alert", () => {
    expect(rowCount(db, "alerts", "category = 'abnormal_reading'")).toBe(1);
  });

  it("alerts table has exactly one 'goal_risk' alert", () => {
    expect(rowCount(db, "alerts", "category = 'goal_risk'")).toBe(1);
  });

  it("alerts table has exactly one 'sync_failure' alert", () => {
    expect(rowCount(db, "alerts", "category = 'sync_failure'")).toBe(1);
  });

  it("alerts table has both acknowledged (1) and unacknowledged (0) alerts", () => {
    expect(rowCount(db, "alerts", "acknowledged = 1")).toBe(2);
    expect(rowCount(db, "alerts", "acknowledged = 0")).toBe(2);
  });

  // ── insights ──────────────────────────────────────────────────────────────────

  it("insights table has 'trend_summary' insight_type", () => {
    expect(rowCount(db, "insights")).toBeGreaterThan(0);
    expect(rowCount(db, "insights", "insight_type = 'trend_summary'")).toBe(2);
  });

  it("insights table has 'recommendation' insight_type", () => {
    expect(rowCount(db, "insights", "insight_type = 'recommendation'")).toBe(1);
  });

  it("insights table has 'nudge' insight_type", () => {
    expect(rowCount(db, "insights", "insight_type = 'nudge'")).toBe(2);
  });

  // ── engagement events ─────────────────────────────────────────────────────────

  it("engagement_events covers all 7 event_type values exactly", () => {
    expect(rowCount(db, "engagement_events")).toBe(7);
    const types = distinctValues(db, "engagement_events", "event_type");
    expect(types).toEqual([
      "alert_view",
      "dashboard_view",
      "device_sync",
      "goal_create",
      "goal_view",
      "login",
      "nudge_dismiss",
    ]);
  });

  // ── partner services ──────────────────────────────────────────────────────────

  it("partner_services table has exactly 8 rows", () => {
    expect(rowCount(db, "partner_services")).toBe(8);
  });

  it("partner_services covers 'fitness', 'nutrition', 'mental_health', 'sleep', and 'coaching' categories", () => {
    const categories = distinctValues(db, "partner_services", "category");
    expect(categories).toContain("fitness");
    expect(categories).toContain("nutrition");
    expect(categories).toContain("mental_health");
    expect(categories).toContain("sleep");
    expect(categories).toContain("coaching");
  });

  it("partner_services has both 'future_ready' and 'deferred' marketplace_status values", () => {
    const statuses = distinctValues(db, "partner_services", "marketplace_status");
    expect(statuses).toContain("future_ready");
    expect(statuses).toContain("deferred");
  });

  // ── privacy requests ──────────────────────────────────────────────────────────

  it("privacy_requests has an 'export' request with status 'completed'", () => {
    expect(rowCount(db, "privacy_requests")).toBeGreaterThan(0);
    const row = db
      .prepare(
        "SELECT request_status FROM privacy_requests WHERE request_type = 'export'",
      )
      .get() as { request_status: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.request_status).toBe("completed");
  });

  it("privacy_requests has a 'delete' request with status 'requested'", () => {
    const row = db
      .prepare(
        "SELECT request_status FROM privacy_requests WHERE request_type = 'delete'",
      )
      .get() as { request_status: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.request_status).toBe("requested");
  });
});

// ── Criterion 2: seeding script is created ────────────────────────────────────

describe("Criterion 2 – seeding script is created", () => {
  it("seed.ts exists at apps/api/src/db/seed.ts", () => {
    expect(existsSync(join(THIS_DIR, "db", "seed.ts"))).toBe(true);
  });

  it("apps/api/package.json defines a 'seed' script entry", () => {
    // Precondition: package.json must exist
    expect(existsSync(join(API_ROOT, "package.json"))).toBe(true);

    const pkg = JSON.parse(
      readFileSync(join(API_ROOT, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts?.["seed"]).toBeDefined();
    expect(typeof pkg.scripts?.["seed"]).toBe("string");
    expect((pkg.scripts?.["seed"] ?? "").length).toBeGreaterThan(0);
  });

  it("package.json seed script command references 'seed.ts' (the correct entry point)", () => {
    const pkg = JSON.parse(
      readFileSync(join(API_ROOT, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };

    const seedCmd = pkg.scripts?.["seed"] ?? "";
    // The script must invoke the seed file (tsx src/db/seed.ts or similar)
    expect(seedCmd).toContain("seed");
    expect(seedCmd).toContain("db");
  });
});

// ── Criterion 3: README documents how to run the seeding script ───────────────

describe("Criterion 3 – README.md documents how to run the seeding script against the database", () => {
  let readme: string;

  beforeAll(() => {
    // Precondition: README.md must exist at the repository root
    expect(existsSync(join(REPO_ROOT, "README.md")), "README.md must exist at the repo root").toBe(
      true,
    );
    readme = readFileSync(join(REPO_ROOT, "README.md"), "utf-8");
    // Precondition: README must be non-empty
    expect(readme.length, "README.md must be non-empty").toBeGreaterThan(0);
  });

  it("README.md contains the exact 'npm run seed' command to run the script", () => {
    expect(readme).toContain("npm run seed");
  });

  it("README.md documents the DB_PATH environment variable used to configure the database path", () => {
    expect(readme).toContain("DB_PATH");
  });

  it("README.md has a dedicated seeding section (heading contains 'Seed')", () => {
    // The seeding section must be a distinct heading, not just a passing mention
    const hasSeedingHeading = /^#{1,4}\s.*[Ss]eed/m.test(readme);
    expect(hasSeedingHeading).toBe(true);
  });

  it("README.md lists the entity types the seed script inserts", () => {
    // The README should enumerate at least some of the seeded domain entities
    // so readers know what 'demo data' looks like in their database.
    const mentionsUsers = readme.toLowerCase().includes("user");
    const mentionsDevices = readme.toLowerCase().includes("device");
    const mentionsGoals = readme.toLowerCase().includes("goal");
    const mentionsHealth = readme.toLowerCase().includes("health");
    expect(mentionsUsers && mentionsDevices && mentionsGoals && mentionsHealth).toBe(true);
  });

  it("README.md states the seed script prints 'Seed complete.' on success", () => {
    expect(readme).toContain("Seed complete.");
  });
});

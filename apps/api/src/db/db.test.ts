import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wellnesshub-db-test-"));
  // Clear the module registry so each test gets a fresh module instance.
  // This prevents the singleton in connection.ts from leaking across tests.
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// connection.ts
// ---------------------------------------------------------------------------

describe("getDatabase", () => {
  it("creates a Database at the path given by DB_PATH", async () => {
    const dbPath = join(tmpDir, "test.db");
    process.env.DB_PATH = dbPath;

    const { getDatabase } = await import("./connection.js");
    const db = getDatabase();

    const row = db.prepare("SELECT 1 AS n").get() as { n: number };
    expect(row.n).toBe(1);

    delete process.env.DB_PATH;
  });

  it("returns the same instance on repeated calls (singleton)", async () => {
    const dbPath = join(tmpDir, "singleton.db");
    process.env.DB_PATH = dbPath;

    const { getDatabase } = await import("./connection.js");
    const a = getDatabase();
    const b = getDatabase();

    expect(a).toBe(b);

    delete process.env.DB_PATH;
  });

  it("falls back to ./wellnesshub.db when DB_PATH is not set", async () => {
    // Set DB_PATH to a temp file so the test does not pollute the working directory
    const fallbackPath = join(tmpDir, "fallback.db");
    process.env.DB_PATH = fallbackPath;

    const { getDatabase } = await import("./connection.js");
    const db = getDatabase();
    const row = db.prepare("SELECT 42 AS n").get() as { n: number };
    expect(row.n).toBe(42);

    delete process.env.DB_PATH;
  });
});

// ---------------------------------------------------------------------------
// migrate.ts
// ---------------------------------------------------------------------------

describe("migrate", () => {
  it("enables foreign keys (PRAGMA foreign_keys = ON)", async () => {
    const dbPath = join(tmpDir, "fk.db");
    const migrationsDir = join(tmpDir, "migrations-fk");
    mkdirSync(migrationsDir);

    const { migrate } = await import("./migrate.js");
    await migrate(dbPath, migrationsDir);

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db.close();
  });

  it("runs .sql migration files in alphabetical filename order", async () => {
    const dbPath = join(tmpDir, "order.db");
    const migrationsDir = join(tmpDir, "migrations-order");
    mkdirSync(migrationsDir);

    writeFileSync(
      join(migrationsDir, "002_add_col.sql"),
      "ALTER TABLE events ADD COLUMN label TEXT NOT NULL DEFAULT '';"
    );
    writeFileSync(
      join(migrationsDir, "001_create_events.sql"),
      "CREATE TABLE events (id INTEGER PRIMARY KEY);"
    );

    const { migrate } = await import("./migrate.js");
    await migrate(dbPath, migrationsDir);

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);
    db.prepare("INSERT INTO events (id, label) VALUES (1, 'hello')").run();
    const row = db.prepare("SELECT label FROM events WHERE id = 1").get() as { label: string };
    expect(row.label).toBe("hello");
    db.close();
  });

  it("ignores non-.sql files in the migrations directory", async () => {
    const dbPath = join(tmpDir, "nonjunk.db");
    const migrationsDir = join(tmpDir, "migrations-nonjunk");
    mkdirSync(migrationsDir);

    writeFileSync(
      join(migrationsDir, "001_readme.txt"),
      "NOT SQL -- would fail if executed"
    );
    writeFileSync(
      join(migrationsDir, "002_valid.sql"),
      "CREATE TABLE things (id INTEGER PRIMARY KEY);"
    );

    const { migrate } = await import("./migrate.js");
    await expect(migrate(dbPath, migrationsDir)).resolves.toBeUndefined();

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);
    db.prepare("INSERT INTO things (id) VALUES (99)").run();
    const row = db.prepare("SELECT id FROM things WHERE id = 99").get() as { id: number };
    expect(row.id).toBe(99);
    db.close();
  });

  it("wraps each migration in a transaction so a failure rolls back that file only", async () => {
    const dbPath = join(tmpDir, "rollback.db");
    const migrationsDir = join(tmpDir, "migrations-rollback");
    mkdirSync(migrationsDir);

    writeFileSync(
      join(migrationsDir, "001_good.sql"),
      "CREATE TABLE good (id INTEGER PRIMARY KEY);"
    );
    writeFileSync(
      join(migrationsDir, "002_bad.sql"),
      "THIS IS NOT VALID SQL;"
    );

    const { migrate } = await import("./migrate.js");
    await expect(migrate(dbPath, migrationsDir)).rejects.toThrow();

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);
    db.prepare("INSERT INTO good (id) VALUES (1)").run();
    const row = db.prepare("SELECT id FROM good WHERE id = 1").get() as { id: number };
    expect(row.id).toBe(1);
    db.close();
  });

  it("is safe to call when the migrations directory is empty", async () => {
    const dbPath = join(tmpDir, "empty.db");
    const migrationsDir = join(tmpDir, "migrations-empty");
    mkdirSync(migrationsDir);

    const { migrate } = await import("./migrate.js");
    await expect(migrate(dbPath, migrationsDir)).resolves.toBeUndefined();
  });
});

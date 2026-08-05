import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDatabase } from "./connection.js";

export function migrate(migrationsDir: string): void {
  const db = getDatabase();

  db.pragma("foreign_keys = ON");

  // Ensure applied-migrations tracker exists
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       filename TEXT NOT NULL PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  if (!existsSync(migrationsDir)) {
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const alreadyApplied = db
      .prepare("SELECT 1 FROM _migrations WHERE filename = ?")
      .get(file);

    if (alreadyApplied) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const runMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)",
      ).run(file, new Date().toISOString());
    });
    runMigration();
  }
}

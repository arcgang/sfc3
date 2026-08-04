import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function migrate(dbPath: string, migrationsDir: string): Promise<void> {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const runMigration = db.transaction(() => {
      db.exec(sql);
    });
    runMigration();
  }

  db.close();
}

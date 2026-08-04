import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDatabase } from "./connection.js";

export function migrate(dbPath: string, migrationsDir: string): void {
  const db = getDatabase(dbPath);

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
}

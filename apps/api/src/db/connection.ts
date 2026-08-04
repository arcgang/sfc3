import Database from "better-sqlite3";

let instance: Database.Database | undefined;

export function getDatabase(): Database.Database {
  if (!instance) {
    const dbPath = process.env.DB_PATH ?? "./wellnesshub.db";
    instance = new Database(dbPath);
    instance.pragma("foreign_keys = ON");
  }
  return instance;
}

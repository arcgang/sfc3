import Database from "better-sqlite3";

let instance: Database.Database | undefined;

export function getDatabase(path?: string): Database.Database {
  if (!instance) {
    const dbPath = path ?? process.env.DB_PATH ?? "./wellnesshub.db";
    instance = new Database(dbPath);
    instance.pragma("foreign_keys = ON");
  }
  return instance;
}

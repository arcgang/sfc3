import { getDatabase, resetDatabase } from "./db/connection.js";

export { getDatabase, resetDatabase };

const db = getDatabase();

db.exec(`
  CREATE TABLE IF NOT EXISTS insights (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL,
    category     TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    narrative    TEXT    NOT NULL,
    icon         TEXT,
    link_label   TEXT,
    link_type    TEXT,
    generated_at TEXT    NOT NULL
  )
`);

export default db;

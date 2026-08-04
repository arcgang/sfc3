import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { health } from "./health.js";
import { migrate } from "./db/migrate.js";

const port = Number(process.env.PORT ?? 3000);

const dbPath = process.env.DB_PATH ?? "./wellnesshub.db";
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");

await migrate(dbPath, migrationsDir);

createServer((req, res) => {
  if (req.url === "/health") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(health()));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
}).listen(port, () => console.log(`service listening on :${port}`));

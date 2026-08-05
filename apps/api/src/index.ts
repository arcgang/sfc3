import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import express from "express";
import { buildConfig } from "./config.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { devicesRouter } from "./api/devicesRoutes.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");
migrate(migrationsDir);

const app = express();

app.use(express.json());
app.use(correlationIdMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const requireAuth = authMiddleware(config.jwtSecret);

app.use("/api/v1/devices", requireAuth, devicesRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log({ event: "server.started", port: config.port });
});

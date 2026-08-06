import "./db.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import express from "express";
import { buildConfig } from "./config.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { devicesRouter } from "./api/devicesRoutes.js";
import { alertsRouter } from "./api/alertsRoutes.js";
import { recommendationsRouter } from "./api/recommendationsRoutes.js";
import { goalsRouter } from "./routes/goals.js";
import { dashboardRouter } from "./api/dashboardRoutes.js";
import { dashboardRefreshRouter } from "./routes/dashboard.js";
import { buildAuthRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { privacyRouter } from "./routes/privacy.js";
import { health } from "./health.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");
migrate(migrationsDir);

const app = express();
app.use(express.json());
app.use(correlationIdMiddleware);

app.get("/health", (_req, res) => {
  res.json(health());
});

app.use("/api/v1/auth", buildAuthRouter(config.jwtSecret));

const requireAuth = authMiddleware(config.jwtSecret);

app.use("/api/v1/profile", requireAuth, profileRouter);
app.use("/api/v1/devices", requireAuth, devicesRouter);
app.use("/api/v1/alerts", requireAuth, alertsRouter);
app.use("/api/v1/goals", requireAuth, goalsRouter);
app.use("/api/v1/dashboard", requireAuth, dashboardRouter);
app.use("/api/v1/dashboard/refresh", requireAuth, dashboardRefreshRouter);
app.use("/api/v1/privacy", requireAuth, privacyRouter);
app.use("/api/v1/recommendations", requireAuth, recommendationsRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

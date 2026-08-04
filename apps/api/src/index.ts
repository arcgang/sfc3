import express from "express";
import { health } from "./health.js";
import { buildConfig } from "./config.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const app = express();

app.use(correlationIdMiddleware);

app.get("/health", (_req, res) => {
  res.json(health());
});

const requireAuth = authMiddleware(config.jwtSecret);

app.get("/api/v1/me", requireAuth, (_req, res) => {
  res.json({ user: res.locals["user"] });
});
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

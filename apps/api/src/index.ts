import express from "express";
import { health } from "./health.js";
import { buildConfig } from "./config.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { errorHandler } from "./middleware/errorHandler.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const app = express();

app.use(correlationIdMiddleware);

app.get("/health", (_req, res) => {
  res.json(health());
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

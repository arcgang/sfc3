import express from "express";
import { health } from "./health.js";
import { buildConfig } from "./config.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const app = express();

app.get("/health", (_req, res) => {
  res.json(health());
});

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

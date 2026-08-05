import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { health } from "./health.js";
import { buildConfig } from "./config.js";
import { validateBody } from "./middleware/validate.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { migrate } from "./db/migrate.js";
import { authRouter } from "./api/authController.js";
import { goalsRouter } from "./api/goalsController.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");

migrate(migrationsDir);
const app = express();

app.use(express.json());
app.use(correlationIdMiddleware);

app.get("/health", (_req, res) => {
  res.json(health());
});

app.use("/api/v1/auth", authRouter);

const requireAuth = authMiddleware(config.jwtSecret);

app.get("/api/v1/me", requireAuth, (_req, res) => {
  res.json({ user: res.locals["user"] });
});

const echoSchema = z.object({
  message: z.string().min(1),
});

app.post("/echo", validateBody(echoSchema), (req: Request, res: Response) => {
  const { message } = req.body as z.infer<typeof echoSchema>;
  res.json({ message });
});

app.use("/api/v1/goals", requireAuth, goalsRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

import express, { type Request, type Response } from "express";
import { z } from "zod";
import { health } from "./health.js";
import { buildConfig } from "./config.js";
import { validateBody } from "./middleware/validate.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { errorHandler } from "./middleware/errorHandler.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const app = express();

app.use(express.json());
app.use(correlationIdMiddleware);

app.get("/health", (_req, res) => {
  res.json(health());
});

const echoSchema = z.object({
  message: z.string().min(1),
});

app.post("/echo", validateBody(echoSchema), (req: Request, res: Response) => {
  const { message } = req.body as z.infer<typeof echoSchema>;
  res.json({ message });
});
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

import express, { type Request, type Response } from "express";
import { z } from "zod";
import { health } from "./health.js";
import { buildConfig } from "./config.js";
import { validateBody } from "./middleware/validate.js";

const config = buildConfig(process.env as Record<string, string | undefined>);

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json(health());
});

// Protected stub route — exercises validateBody end-to-end
const echoSchema = z.object({
  message: z.string().min(1),
});

app.post("/echo", validateBody(echoSchema), (req: Request, res: Response) => {
  res.json({ message: (req.body as { message: string }).message });
});

app.listen(config.port, () => {
  console.log(`service listening on :${config.port}`);
});

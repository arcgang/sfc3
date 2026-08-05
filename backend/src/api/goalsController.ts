import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { getDatabase } from "../db/connection.js";
import { GoalService } from "../services/GoalService.js";
import type { ErrorResponse } from "../types/errors.js";

const GOAL_TYPE_CADENCE: Record<string, string> = {
  steps_daily: "daily",
  sleep_minutes_daily: "daily",
  active_minutes_weekly: "weekly",
};

const createGoalSchema = z
  .object({
    goalType: z.enum([
      "steps_daily",
      "sleep_minutes_daily",
      "weight_target",
      "active_minutes_weekly",
    ]),
    targetValue: z.number().gt(0),
    targetUnit: z.string().min(1),
    cadence: z.enum(["daily", "weekly"]),
    startDate: z.string().date().optional(),
  })
  .superRefine((data, ctx) => {
    const required = GOAL_TYPE_CADENCE[data.goalType];
    if (required !== undefined && data.cadence !== required) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.goalType} requires cadence '${required}'`,
        path: ["cadence"],
      });
    }
  });

export const goalsRouter = Router();

goalsRouter.post(
  "/",
  validateBody(createGoalSchema),
  (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const user = res.locals["user"] as { sub: string } | undefined;
    if (!user?.sub) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: { type: "AUTH_TOKEN_INVALID", details: [] },
      };
      res.status(401).json(body);
      return;
    }

    const input = req.body as z.infer<typeof createGoalSchema>;
    const service = new GoalService(getDatabase());
    const result = service.create(user.sub, input);

    res.status(201).json({
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
      },
      data: result,
    });
  },
);

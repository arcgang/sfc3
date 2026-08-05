import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

const GOAL_TYPE_REQUIRED_CADENCE: Record<string, string> = {
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
    targetUnit: z.string().optional(),
    cadence: z.enum(["daily", "weekly"]),
    startDate: z.string().date().optional(),
  })
  .superRefine((data, ctx) => {
    const required = GOAL_TYPE_REQUIRED_CADENCE[data.goalType];
    if (required !== undefined && data.cadence !== required) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.goalType} requires cadence '${required}'`,
        path: ["cadence"],
      });
    }
  });

type CreateGoalBody = z.infer<typeof createGoalSchema>;

export const goalsRouter = Router();

goalsRouter.post(
  "/",
  validateBody(createGoalSchema),
  (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const rawUser = res.locals["user"];
    if (
      typeof rawUser !== "object" ||
      rawUser === null ||
      typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
    ) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "AUTH_TOKEN_INVALID",
          details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
        },
      };
      res.status(401).json(body);
      return;
    }
    const userId = (rawUser as { sub: string }).sub;

    const input = req.body as CreateGoalBody;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const goalId = randomUUID();
    const eventId = randomUUID();
    const startDate = input.startDate ?? today;
    const targetUnit = input.targetUnit ?? "";

    const db = getDatabase();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO goals
           (id, user_id, goal_type, target_value, target_unit, cadence, start_date, status, created_at, updated_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).run(
        goalId,
        userId,
        input.goalType,
        input.targetValue,
        targetUnit,
        input.cadence,
        startDate,
        now,
        now,
      );

      db.prepare(
        `INSERT INTO engagement_events
           (id, user_id, event_type, occurred_at, event_date, event_timestamp, event_context_json)
         VALUES
           (?, ?, 'goal_create', ?, ?, ?, ?)`,
      ).run(eventId, userId, now, today, now, JSON.stringify({ goalId }));
    })();

    const goal = db
      .prepare(
        `SELECT id, goal_type, target_value, target_unit, cadence, start_date, status, created_at
           FROM goals WHERE id = ?`,
      )
      .get(goalId) as {
      id: string;
      goal_type: string;
      target_value: number;
      target_unit: string;
      cadence: string;
      start_date: string;
      status: string;
      created_at: string;
    };

    res.status(201).json({
      meta: { correlationId, timestamp: now },
      data: {
        goal: {
          id: goal.id,
          goalType: goal.goal_type,
          targetValue: goal.target_value,
          targetUnit: goal.target_unit,
          cadence: goal.cadence,
          startDate: goal.start_date,
          status: goal.status,
          createdAt: goal.created_at,
        },
      },
    });
  },
);

goalsRouter.get("/", (req: Request, res: Response): void => {
  const correlationId =
    typeof res.locals["correlationId"] === "string"
      ? res.locals["correlationId"]
      : "";

  const rawUser = res.locals["user"];
  if (
    typeof rawUser !== "object" ||
    rawUser === null ||
    typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
  ) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "AUTH_TOKEN_INVALID",
        details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
      },
    };
    res.status(401).json(body);
    return;
  }
  const userId = (rawUser as { sub: string }).sub;

  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, goal_type, target_value, target_unit, cadence, start_date, status, created_at
         FROM goals
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 200`,
    )
    .all(userId) as Array<{
    id: string;
    goal_type: string;
    target_value: number;
    target_unit: string;
    cadence: string;
    start_date: string;
    status: string;
    created_at: string;
  }>;

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: {
      goals: rows.map((r) => ({
        id: r.id,
        goalType: r.goal_type,
        targetValue: r.target_value,
        targetUnit: r.target_unit,
        cadence: r.cadence,
        startDate: r.start_date,
        status: r.status,
        createdAt: r.created_at,
      })),
    },
  });
});

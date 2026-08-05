import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";
import { calculateGoalProgress } from "./GoalProgressCalculator.js";
import type { HealthRecordInput } from "./GoalProgressCalculator.js";

// ---------------------------------------------------------------------------
// Goal type → required cadence constraint
// ---------------------------------------------------------------------------

const GOAL_TYPE_REQUIRED_CADENCE: Record<string, string> = {
  steps_daily: "daily",
  sleep_minutes_daily: "daily",
  active_minutes_weekly: "weekly",
};

// ---------------------------------------------------------------------------
// Goal type → metric_domain and metric_type for health_records lookup
// ---------------------------------------------------------------------------

const GOAL_METRIC_MAP: Record<
  string,
  { metricDomain: string; metricName: string }
> = {
  steps_daily: { metricDomain: "activity", metricName: "steps" },
  sleep_minutes_daily: { metricDomain: "sleep", metricName: "sleep_minutes" },
  weight_target: { metricDomain: "body_composition", metricName: "weight" },
  active_minutes_weekly: { metricDomain: "activity", metricName: "active_minutes" },
};

// ---------------------------------------------------------------------------
// Validation schema for POST
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: extract authenticated user id
// ---------------------------------------------------------------------------

function extractUserId(
  res: Response,
  correlationId: string,
): string | null {
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
    return null;
  }
  return (rawUser as { sub: string }).sub;
}

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

interface GoalDbRow {
  id: string;
  goal_type: string;
  target_value: number;
  target_unit: string;
  cadence: string;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  metric_domain: string | null;
  metric_type: string | null;
}

interface HealthRecordDbRow {
  metric_name: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

interface GoalInsightDbRow {
  id: string;
  goal_id: string | null;
  title: string;
  body: string;
  insight_type: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const goalsRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/goals — create a goal
// ---------------------------------------------------------------------------

goalsRouter.post(
  "/",
  validateBody(createGoalSchema),
  (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const userId = extractUserId(res, correlationId);
    if (userId === null) return;

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
      ).run(goalId, userId, input.goalType, input.targetValue, targetUnit, input.cadence, startDate, now, now);

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
      .get(goalId) as GoalDbRow;

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

// ---------------------------------------------------------------------------
// GET /api/v1/goals — list goals with progress
// ---------------------------------------------------------------------------

goalsRouter.get("/", (req: Request, res: Response): void => {
  const correlationId =
    typeof res.locals["correlationId"] === "string"
      ? res.locals["correlationId"]
      : "";

  const userId = extractUserId(res, correlationId);
  if (userId === null) return;

  const db = getDatabase();
  const now = new Date();

  const goalRows = db
    .prepare(
      `SELECT id, goal_type, target_value, target_unit, cadence, start_date, end_date,
              status, created_at, metric_domain, metric_type
         FROM goals
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 200`,
    )
    .all(userId) as GoalDbRow[];

  // Fetch health records needed for each active goal in a single query per goal
  const goalsWithProgress = goalRows.map((row) => {
    const mapping = GOAL_METRIC_MAP[row.goal_type];
    let records: HealthRecordInput[] = [];

    if (mapping) {
      // Use goal's metric_domain/metric_type if set, fall back to mapping
      const domain = row.metric_domain ?? mapping.metricDomain;
      const name = row.metric_type ?? mapping.metricName;

      const healthRows = db
        .prepare(
          `SELECT metric_name, value, unit, recorded_at
             FROM health_records
             WHERE user_id = ?
               AND metric_domain = ?
               AND metric_name = ?
               AND recorded_at >= ?
             ORDER BY recorded_at DESC
             LIMIT 100`,
        )
        .all(
          userId,
          domain,
          name,
          new Date(now.getTime() - 14 * 86_400_000).toISOString(),
        ) as HealthRecordDbRow[];

      records = healthRows.map((h) => ({
        metricName: h.metric_name,
        value: h.value,
        unit: h.unit,
        recordedAt: h.recorded_at,
      }));
    }

    const progress = calculateGoalProgress(
      {
        goalType: row.goal_type,
        targetValue: row.target_value,
        targetUnit: row.target_unit,
        cadence: row.cadence as "daily" | "weekly",
        startDate: row.start_date,
        endDate: row.end_date,
      },
      records,
      now,
    );

    const section: "active" | "completed" =
      progress.status === "completed" || row.status === "completed" || row.status === "archived"
        ? "completed"
        : "active";

    return {
      id: row.id,
      goalType: row.goal_type,
      targetValue: row.target_value,
      targetUnit: row.target_unit,
      cadence: row.cadence,
      startDate: row.start_date,
      endDate: row.end_date ?? null,
      status: progress.status,
      createdAt: row.created_at,
      currentValue: progress.currentValue,
      currentDisplay: progress.currentDisplay,
      weekOverWeekChange: progress.weekOverWeekChange,
      progressPercent: progress.progressPercent,
      section,
    };
  });

  const insightRows = db
    .prepare(
      `SELECT id, goal_id, title, body, insight_type, created_at
         FROM goal_insights
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
    )
    .all(userId) as GoalInsightDbRow[];

  const insights = insightRows.map((r) => ({
    id: r.id,
    goalId: r.goal_id ?? null,
    title: r.title,
    body: r.body,
    insightType: r.insight_type,
    createdAt: r.created_at,
  }));

  res.status(200).json({
    meta: { correlationId, timestamp: now.toISOString() },
    data: {
      goals: goalsWithProgress,
      insights,
    },
  });
});

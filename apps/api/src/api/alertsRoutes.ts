import { Router, type Request, type Response } from "express";
import { getDatabase } from "../db/connection.js";
import { AlertDao } from "../repositories/AlertDao.js";
import { evaluateAndPersist, acknowledgeAlert } from "../alerts/alertRuleEngine.js";
import type { ErrorResponse } from "../types/errors.js";

export const alertsRouter = Router();

function getCorrelationId(res: Response): string {
  return typeof res.locals["correlationId"] === "string" ? res.locals["correlationId"] : "";
}

function getUserId(res: Response): string | null {
  const rawUser = res.locals["user"];
  if (
    typeof rawUser !== "object" ||
    rawUser === null ||
    typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
  ) {
    return null;
  }
  return (rawUser as { sub: string }).sub;
}

alertsRouter.post("/generate", async (req: Request, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (userId === null) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "AUTH_TOKEN_INVALID", details: [] },
    };
    res.status(401).json(body);
    return;
  }

  try {
    const db = getDatabase();
    const count = await evaluateAndPersist(userId, db);
    res.status(200).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: { count },
    });
  } catch (err) {
    console.error(JSON.stringify({ event: "alerts.generate_error", user_id: userId, error: String(err) }));
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "INTERNAL_ERROR", details: [{ code: "INTERNAL_ERROR", message: "An unexpected error occurred." }] },
    };
    res.status(500).json(body);
  }
});

alertsRouter.get("/", (req: Request, res: Response): void => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (userId === null) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "AUTH_TOKEN_INVALID", details: [] },
    };
    res.status(401).json(body);
    return;
  }

  const db = getDatabase();
  const dao = new AlertDao(db);
  const alerts = dao.listUnacknowledged(userId);

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: alerts,
  });
});

alertsRouter.patch("/:id/acknowledge", async (req: Request, res: Response): Promise<void> => {
  const rawId: string = req.params["id"] as string;
  const id = parseInt(rawId, 10);

  const correlationId = getCorrelationId(res);

  if (isNaN(id)) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "RESOURCE_NOT_FOUND",
        details: [{ code: "RESOURCE_NOT_FOUND", message: "Alert not found." }],
      },
    };
    res.status(404).json(body);
    return;
  }

  const userId = getUserId(res);
  if (userId === null) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "AUTH_TOKEN_INVALID", details: [] },
    };
    res.status(401).json(body);
    return;
  }

  try {
    const db = getDatabase();
    await acknowledgeAlert(id, userId, db);
    res.status(204).end();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "RESOURCE_NOT_FOUND") {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "RESOURCE_NOT_FOUND",
          details: [{ code: "RESOURCE_NOT_FOUND", message: "Alert not found." }],
        },
      };
      res.status(404).json(body);
      return;
    }
    console.error(JSON.stringify({ event: "alerts.acknowledge_error", alert_id: id, user_id: userId, error: String(err) }));
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "INTERNAL_ERROR", details: [{ code: "INTERNAL_ERROR", message: "An unexpected error occurred." }] },
    };
    res.status(500).json(body);
  }
});

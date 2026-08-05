import { Router, type Request, type Response } from "express";
import { getDatabase } from "../db/connection.js";
import { AlertDao } from "../repositories/AlertDao.js";
import type { ErrorResponse } from "../types/errors.js";

export const alertsRouter = Router();

alertsRouter.patch("/:id/acknowledge", (req: Request, res: Response): void => {
  const rawId: string = req.params["id"] as string;
  const id = parseInt(rawId, 10);

  const correlationId =
    typeof res.locals["correlationId"] === "string" ? res.locals["correlationId"] : "";

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

  const rawUser = res.locals["user"];
  if (
    typeof rawUser !== "object" ||
    rawUser === null ||
    typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
  ) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "AUTH_TOKEN_INVALID", details: [] },
    };
    res.status(401).json(body);
    return;
  }
  const userId = (rawUser as { sub: string }).sub;

  const db = getDatabase();
  const dao = new AlertDao(db);

  const alert = dao.acknowledge(id, userId);

  if (!alert) {
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

  console.log({
    event: "alerts.acknowledged",
    alert_id: alert.id,
    user_id: alert.userId,
  });

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: { alert },
  });
});

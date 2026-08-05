import { Router, type Request, type Response } from "express";
import { getDatabase } from "../db/connection.js";
import { DashboardDao } from "../repositories/DashboardDao.js";
import type { ErrorResponse } from "../types/errors.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", (req: Request, res: Response): void => {
  const correlationId =
    typeof res.locals["correlationId"] === "string" ? res.locals["correlationId"] : "";

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
  const dao = new DashboardDao(db);
  const data = dao.getForUser(userId);

  res.setHeader("X-Correlation-Id", correlationId);
  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data,
  });
});

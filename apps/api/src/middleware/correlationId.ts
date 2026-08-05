import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

export function correlationIdMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const correlationId = randomUUID();
  res.locals["correlationId"] = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);
  next();
}

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export function correlationIdMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = uuidv4();
  res.locals["correlationId"] = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);
  next();
}

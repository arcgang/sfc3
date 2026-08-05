import type { Request, Response, NextFunction } from "express";
import type { ErrorResponse } from "../types/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId =
    typeof res.locals["correlationId"] === "string"
      ? res.locals["correlationId"]
      : "unknown";

  console.error({ correlationId, err });

  const body: ErrorResponse = {
    meta: {
      correlationId,
      timestamp: new Date().toISOString(),
    },
    error: {
      type: "INTERNAL_ERROR",
      details: [],
    },
  };

  res.setHeader("X-Correlation-Id", correlationId);
  res.status(500).json(body);
}

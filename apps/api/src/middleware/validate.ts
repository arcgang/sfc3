import type { Request, Response, NextFunction } from "express";
import { type ZodSchema } from "zod";
import type { ErrorResponse } from "../types/errors.js";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      next();
      return;
    }

    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const details = result.error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      field: issue.path.join("."),
    }));

    const body: ErrorResponse = {
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
      },
      error: {
        type: "REQUEST_VALIDATION_FAILED",
        details,
      },
    };

    res.status(422).json(body);
  };
}

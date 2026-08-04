import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export function correlationIdMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.locals["correlationId"] = uuidv4();
  next();
}

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { ErrorResponse } from "../types/errors.js";

export function authMiddleware(
  jwtSecret: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return function (req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      rejectUnauthorized(res, "missing Bearer token");
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, jwtSecret);
      res.locals["user"] = decoded;
      next();
    } catch (err) {
      const reason =
        err instanceof jwt.TokenExpiredError
          ? "token expired"
          : err instanceof jwt.JsonWebTokenError
            ? "invalid token signature or structure"
            : "token verification failed";
      rejectUnauthorized(res, reason);
    }
  };
}

function rejectUnauthorized(res: Response, reason: string): void {
  console.log({
    event: "auth.session_attempt",
    success: false,
    reason,
    correlationId: res.locals["correlationId"] as string | undefined,
  });

  const body: ErrorResponse = {
    meta: {
      correlationId: (res.locals["correlationId"] as string) ?? "",
      timestamp: new Date().toISOString(),
    },
    error: {
      type: "AUTH_TOKEN_INVALID",
      details: [],
    },
  };

  res.status(401).json(body);
}

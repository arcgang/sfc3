import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

const createRequestSchema = z.object({
  requestType: z.enum(["export", "delete"]),
});

type CreateRequestBody = z.infer<typeof createRequestSchema>;

function extractUserId(res: Response): string | null {
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

function sendUnauth(res: Response, correlationId: string): void {
  const body: ErrorResponse = {
    meta: { correlationId, timestamp: new Date().toISOString() },
    error: {
      type: "AUTH_TOKEN_INVALID",
      details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
    },
  };
  res.status(401).json(body);
}

export const privacyRouter = Router();

// POST /api/v1/privacy/requests — submit export or delete request
privacyRouter.post(
  "/requests",
  validateBody(createRequestSchema),
  (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const userId = extractUserId(res);
    if (userId === null) {
      sendUnauth(res, correlationId);
      return;
    }

    const input = req.body as CreateRequestBody;
    const now = new Date().toISOString();
    const requestId = randomUUID();

    const db = getDatabase();
    db.prepare(
      `INSERT INTO privacy_requests (id, user_id, request_type, request_status, created_at, updated_at)
       VALUES (?, ?, ?, 'requested', ?, ?)`,
    ).run(requestId, userId, input.requestType, now, now);

    console.log({
      event: input.requestType === "export" ? "privacy.export_requested" : "privacy.delete_requested",
      userId,
      requestId,
      correlationId,
    });

    const message =
      input.requestType === "export"
        ? "Your data export request has been received. You will be notified when it is ready."
        : "Your account deletion request has been received. Your account will be processed for deletion.";

    res.status(201).json({
      meta: { correlationId, timestamp: now },
      data: {
        requestId,
        requestType: input.requestType,
        requestStatus: "requested",
        message,
      },
    });
  },
);

// GET /api/v1/privacy/viewed — emit privacy.viewed audit event
privacyRouter.get(
  "/viewed",
  (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const userId = extractUserId(res);
    if (userId === null) {
      sendUnauth(res, correlationId);
      return;
    }

    const now = new Date().toISOString();

    console.log({
      event: "privacy.viewed",
      userId,
      correlationId,
    });

    res.status(200).json({
      meta: { correlationId, timestamp: now },
      data: { acknowledged: true },
    });
  },
);

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { RecommendationService } from "../recommendations.js";
import type { ErrorResponse } from "../types/errors.js";

export const recommendationsRouter = Router();

const patchStatusSchema = z.object({
  status: z.enum(["active", "done", "dismissed"]),
});

function getCorrelationId(res: Response): string {
  return typeof res.locals["correlationId"] === "string"
    ? res.locals["correlationId"]
    : "";
}

function getUserId(res: Response): string | null {
  const raw = res.locals["user"];
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>)["sub"] !== "string"
  ) {
    return null;
  }
  return (raw as { sub: string }).sub;
}

// GET /api/v1/recommendations
recommendationsRouter.get("/", (req: Request, res: Response): void => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (!userId) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "AUTH_TOKEN_INVALID",
        details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
      },
    };
    res.status(401).json(body);
    return;
  }

  const svc = new RecommendationService(getDatabase());
  const rows = svc.generate(userId);

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: rows,
  });
});

// GET /api/v1/recommendations/nudges
recommendationsRouter.get("/nudges", (req: Request, res: Response): void => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (!userId) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "AUTH_TOKEN_INVALID",
        details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
      },
    };
    res.status(401).json(body);
    return;
  }

  const svc = new RecommendationService(getDatabase());
  const nudges = svc.getNudges(userId);

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: nudges,
  });
});

// POST /api/v1/recommendations/nudges/:id/dismiss
recommendationsRouter.post("/nudges/:id/dismiss", (req: Request, res: Response): void => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (!userId) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "AUTH_TOKEN_INVALID",
        details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
      },
    };
    res.status(401).json(body);
    return;
  }

  const id = req.params["id"] as string;
  const svc = new RecommendationService(getDatabase());

  try {
    const result = svc.dismissNudge(id, userId);
    res.status(200).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: result,
    });
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error && (err as NodeJS.ErrnoException).code === "NOT_FOUND";
    if (isNotFound) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "NOT_FOUND",
          details: [{ code: "NOT_FOUND", message: "Nudge not found." }],
        },
      };
      res.status(404).json(body);
      return;
    }
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error({ event: "nudges.dismiss_error", id, correlationId, message });
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "INTERNAL_ERROR",
        details: [{ code: "INTERNAL_ERROR", message }],
      },
    };
    res.status(500).json(body);
  }
});

// POST /api/v1/recommendations/nudges/:id/mark-done
recommendationsRouter.post("/nudges/:id/mark-done", (req: Request, res: Response): void => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (!userId) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "AUTH_TOKEN_INVALID",
        details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
      },
    };
    res.status(401).json(body);
    return;
  }

  const id = req.params["id"] as string;
  const svc = new RecommendationService(getDatabase());

  try {
    const result = svc.markNudgeDone(id, userId);
    res.status(200).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: result,
    });
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error && (err as NodeJS.ErrnoException).code === "NOT_FOUND";
    if (isNotFound) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "NOT_FOUND",
          details: [{ code: "NOT_FOUND", message: "Nudge not found." }],
        },
      };
      res.status(404).json(body);
      return;
    }
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error({ event: "nudges.markDone_error", id, correlationId, message });
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "INTERNAL_ERROR",
        details: [{ code: "INTERNAL_ERROR", message }],
      },
    };
    res.status(500).json(body);
  }
});

// PATCH /api/v1/recommendations/:id/status
recommendationsRouter.patch("/:id/status", (req: Request, res: Response): void => {
  const correlationId = getCorrelationId(res);
  const userId = getUserId(res);

  if (!userId) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "AUTH_TOKEN_INVALID",
        details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
      },
    };
    res.status(401).json(body);
    return;
  }

  const parsed = patchStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "VALIDATION_ERROR",
        details: parsed.error.errors.map((e) => ({
          code: "VALIDATION_ERROR",
          message: e.message,
          field: e.path.join("."),
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  const id = req.params["id"] as string;
  const svc = new RecommendationService(getDatabase());

  try {
    const updated = svc.setStatus(id, userId, parsed.data.status);
    res.status(200).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: updated,
    });
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error && (err as NodeJS.ErrnoException).code === "NOT_FOUND";
    if (isNotFound) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "NOT_FOUND",
          details: [{ code: "NOT_FOUND", message: "Recommendation not found." }],
        },
      };
      res.status(404).json(body);
      return;
    }
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error({ event: "recommendations.setStatus_error", id, correlationId, message });
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "INTERNAL_ERROR",
        details: [{ code: "INTERNAL_ERROR", message }],
      },
    };
    res.status(500).json(body);
  }
});

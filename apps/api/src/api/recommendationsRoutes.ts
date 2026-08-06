import { Router, type Request, type Response } from "express";

export const recommendationsRouter = Router();

// GET /api/v1/recommendations — stub; business logic added in a later task.
recommendationsRouter.get("/", (_req: Request, res: Response): void => {
  res.status(501).json({
    error: { type: "NOT_IMPLEMENTED", details: [] },
  });
});

// PATCH /api/v1/recommendations/:id/status — stub; business logic added in a later task.
recommendationsRouter.patch("/:id/status", (_req: Request, res: Response): void => {
  res.status(501).json({
    error: { type: "NOT_IMPLEMENTED", details: [] },
  });
});

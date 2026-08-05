import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { AuthService, DuplicateEmailError } from "../services/AuthService.js";
import type { ErrorResponse } from "../types/errors.js";

const registerSchema = z.object({
  mode: z.literal("register"),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
});

export const authRouter = Router();

authRouter.post(
  "/session",
  (req: Request, res: Response, next: NextFunction): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

<<<<<<< HEAD
    // Emit security log for every attempt before validation
    const mode = (req.body as Record<string, unknown>)?.["mode"];
    const email = (req.body as Record<string, unknown>)?.["email"];
    console.log({
      event: "auth.register",
=======
    // Emit a mode-agnostic security log for every attempt before validation
    const mode = (req.body as Record<string, unknown>)?.["mode"];
    const email = (req.body as Record<string, unknown>)?.["email"];
    console.log({
      event: "auth.session_attempt",
>>>>>>> main
      mode,
      email: typeof email === "string" ? email.toLowerCase() : email,
      correlationId,
    });

    if (mode !== "register") {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "REQUEST_VALIDATION_FAILED",
          details: [{ code: "INVALID_ENUM", message: "mode must be one of: register", field: "mode" }],
        },
      };
      res.status(422).json(body);
      return;
    }

    validateBody(registerSchema)(req, res, next);
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const { email, password, fullName } = req.body as z.infer<typeof registerSchema>;

    try {
      const service = new AuthService();
      const result = await service.register(email, password, fullName);

      res.status(201).json({
        meta: { correlationId, timestamp: new Date().toISOString() },
        data: {
          user: {
            id: result.id,
            email: result.email,
            fullName: result.fullName,
            personaMode: result.personaMode,
          },
          requiresOnboarding: result.requiresOnboarding,
        },
      });
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "REQUEST_VALIDATION_FAILED",
            details: [{ code: "EMAIL_ALREADY_REGISTERED", message: "This email address is already in use.", field: "email" }],
          },
        };
        res.status(422).json(body);
        return;
      }
      next(err);
    }
  },
);

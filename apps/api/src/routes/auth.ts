import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

const BCRYPT_ROUNDS = 12;

const registerSchema = z.object({
  mode: z.literal("register"),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
});

type RegisterBody = z.infer<typeof registerSchema>;

export const authRouter = Router();

authRouter.post(
  "/session",
  (req: Request, res: Response, next): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const rawBody = req.body as Record<string, unknown>;
    const mode = rawBody["mode"];
    const email = rawBody["email"];

    console.log({
      event: "auth.registration_attempt",
      mode,
      email: typeof email === "string" ? email.toLowerCase() : email,
      correlationId,
    });

    if (mode !== "register") {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "REQUEST_VALIDATION_FAILED",
          details: [
            {
              code: "INVALID_ENUM",
              message: "mode must be one of: register",
              field: "mode",
            },
          ],
        },
      };
      res.status(400).json(body);
      return;
    }

    validateBody(registerSchema)(req, res, next);
  },
  async (req: Request, res: Response, next): Promise<void> => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const { email, password, fullName } = req.body as RegisterBody;
    const normalised = email.toLowerCase();

    try {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const id = randomUUID();
      const now = new Date().toISOString();

      const db = getDatabase();

      db.prepare(
        `INSERT INTO users (id, email, password_hash, full_name, account_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending_verification', ?, ?)`,
      ).run(id, normalised, passwordHash, fullName, now, now);

      console.log({
        event: "auth.registration_attempt",
        mode: "register",
        email: normalised,
        correlationId,
        outcome: "success",
        userId: id,
      });

      res.status(201).json({
        meta: { correlationId, timestamp: now },
        data: { id, email: normalised },
      });
    } catch (err) {
      const isUniqueConstraintViolation =
        err instanceof Error &&
        err.message.includes("UNIQUE constraint failed: users.email");

      if (isUniqueConstraintViolation) {
        console.log({
          event: "auth.registration_attempt",
          mode: "register",
          email: normalised,
          correlationId,
          outcome: "duplicate_email",
        });

        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "CONFLICT",
            details: [
              {
                code: "EMAIL_CONFLICT",
                message: "An account with this email already exists.",
                field: "email",
              },
            ],
          },
        };
        res.status(409).json(body);
        return;
      }

      next(err);
    }
  },
);

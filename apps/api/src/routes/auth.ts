import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";
import {
  buildEmailServiceClient,
  type EmailServiceClient,
} from "../integrations/EmailServiceClient.js";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY_SECONDS = 3600; // 1 hour

const registerSchema = z.object({
  mode: z.literal("register"),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
});

const loginSchema = z.object({
  mode: z.literal("login"),
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordResetSchema = z.object({
  mode: z.literal("password_reset_request"),
  email: z.string().email(),
});

type RegisterBody = z.infer<typeof registerSchema>;
type LoginBody = z.infer<typeof loginSchema>;

export function buildAuthRouter(
  jwtSecret: string,
  emailClient: EmailServiceClient = buildEmailServiceClient(),
): Router {
  const router = Router();

  router.post(
    "/session",
    (req: Request, res: Response, next): void => {
      const correlationId =
        typeof res.locals["correlationId"] === "string"
          ? res.locals["correlationId"]
          : "";

      const rawBody = req.body as Record<string, unknown>;
      const mode = rawBody["mode"];
      const email = rawBody["email"];

      if (mode === "login") {
        console.log({
          event: "auth.login_attempt",
          email: typeof email === "string" ? email.toLowerCase() : email,
          correlationId,
        });
        validateBody(loginSchema)(req, res, next);
        return;
      }

      if (mode === "password_reset_request") {
        validateBody(passwordResetSchema)(req, res, next);
        return;
      }

      // register (and any unrecognised mode falls through with a log)
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
                message: "mode must be one of: login, register, password_reset_request",
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

      const rawBody = req.body as Record<string, unknown>;
      const mode = rawBody["mode"];

      // -----------------------------------------------------------------------
      // login
      // -----------------------------------------------------------------------
      if (mode === "login") {
        const { email, password } = req.body as LoginBody;
        const normalised = email.toLowerCase();

        try {
          const db = getDatabase();
          const user = db
            .prepare(
              `SELECT id, email, full_name, password_hash, account_status
               FROM users WHERE email = ? LIMIT 1`,
            )
            .get(normalised) as
            | {
                id: string;
                email: string;
                full_name: string;
                password_hash: string;
                account_status: string;
              }
            | undefined;

          const passwordMatch = user
            ? await bcrypt.compare(password, user.password_hash)
            : false;

          if (!user || !passwordMatch) {
            console.log({
              event: "auth.login_attempt",
              email: normalised,
              correlationId,
              outcome: "invalid_credentials",
            });
            const body: ErrorResponse = {
              meta: { correlationId, timestamp: new Date().toISOString() },
              error: {
                type: "AUTH_INVALID_CREDENTIALS",
                details: [
                  {
                    code: "AUTH_INVALID_CREDENTIALS",
                    message: "Invalid email or password.",
                  },
                ],
              },
            };
            res.status(401).json(body);
            return;
          }

          const now = new Date();
          const nowIso = now.toISOString();
          const expiresAt = new Date(now.getTime() + JWT_EXPIRY_SECONDS * 1000).toISOString();

          const accessToken = jwt.sign(
            { sub: user.id, email: user.email },
            jwtSecret,
            { expiresIn: JWT_EXPIRY_SECONDS },
          );

          // Update last_login_at if column exists (migration may have added it)
          try {
            db.prepare(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`).run(
              nowIso,
              nowIso,
              user.id,
            );
          } catch {
            // Column may not exist yet in older migration states — silently continue
          }

          // Record login engagement event
          const eventId = randomUUID();
          const today = nowIso.slice(0, 10);
          db.prepare(
            `INSERT INTO engagement_events
               (id, user_id, event_type, occurred_at, event_date, event_timestamp, event_context_json)
             VALUES (?, ?, 'login', ?, ?, ?, '{}')`,
          ).run(eventId, user.id, nowIso, today, nowIso);

          console.log({
            event: "auth.login_attempt",
            email: normalised,
            correlationId,
            outcome: "success",
            userId: user.id,
          });

          res.status(200).json({
            meta: { correlationId, timestamp: nowIso },
            data: {
              user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                personaMode: "default",
              },
              accessToken,
              expiresAt,
              requiresOnboarding: true,
            },
          });
        } catch (err) {
          next(err);
        }
        return;
      }

      // -----------------------------------------------------------------------
      // password_reset_request
      // -----------------------------------------------------------------------
      if (mode === "password_reset_request") {
        const { email } = req.body as { email: string };
        const normalised = email.toLowerCase();
        const nowIso = new Date().toISOString();

        try {
          const db = getDatabase();
          const user = db
            .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
            .get(normalised) as { id: string } | undefined;

          if (user) {
            try {
              await emailClient.sendPasswordResetInstructions(normalised);
            } catch (emailErr) {
              console.log({
                event: "email.password_reset_instructions_failed",
                correlationId,
                error: emailErr instanceof Error ? emailErr.message : String(emailErr),
              });
            }
          }

          console.log({
            event: "auth.password_reset_requested",
            correlationId,
          });

          res.status(200).json({
            meta: { correlationId, timestamp: nowIso },
            data: {
              message:
                "If the account exists, password reset instructions have been sent.",
            },
          });
        } catch (err) {
          next(err);
        }
        return;
      }

      // -----------------------------------------------------------------------
      // register
      // -----------------------------------------------------------------------
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

  return router;
}

// Backwards-compatible named export for callers that don't need JWT issuance
// (the authMiddleware already has jwtSecret; register-only tests can use this).
// index.ts uses buildAuthRouter(config.jwtSecret) instead.
export const authRouter = buildAuthRouter(process.env["JWT_SECRET"] ?? "dev-secret-not-for-prod");

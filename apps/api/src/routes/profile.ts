import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

const PERSONA_MODES = ['default', 'fitness', 'elder_friendly', 'chronic_care_aware'] as const;
type PersonaMode = typeof PERSONA_MODES[number];

const profileSchema = z.object({
  fullName: z.string().min(1).max(120),
  dateOfBirth: z.string().date().nullable().optional(),
  gender: z.string().max(64).nullable().optional(),
  personaMode: z.enum(PERSONA_MODES).optional(),
  wellnessPreferences: z
    .array(z.string())
    .optional(),
});

type ProfileBody = z.infer<typeof profileSchema>;

export const profileRouter = Router();

profileRouter.get(
  "/",
  (req: Request, res: Response, next: NextFunction): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const rawUser = res.locals["user"];
    if (
      typeof rawUser !== "object" ||
      rawUser === null ||
      typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
    ) {
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
    const userId = (rawUser as { sub: string }).sub;
    const now = new Date().toISOString();

    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `SELECT id, user_id, full_name, date_of_birth, gender, wellness_preferences,
                  persona_mode, created_at, updated_at
             FROM profiles WHERE user_id = ?`,
        )
        .get(userId) as {
        id: string;
        user_id: string;
        full_name: string;
        date_of_birth: string | null;
        gender: string | null;
        wellness_preferences: string;
        persona_mode: string;
        created_at: string;
        updated_at: string;
      } | undefined;

      if (!row) {
        res.status(200).json({
          meta: { correlationId, timestamp: now },
          data: { profile: null },
        });
        return;
      }

      res.status(200).json({
        meta: { correlationId, timestamp: now },
        data: {
          profile: {
            id: row.id,
            userId: row.user_id,
            fullName: row.full_name,
            dateOfBirth: row.date_of_birth,
            gender: row.gender,
            wellnessPreferences: JSON.parse(row.wellness_preferences) as string[],
            personaMode: row.persona_mode,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.put(
  "/",
  validateBody(profileSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const rawUser = res.locals["user"];
    if (
      typeof rawUser !== "object" ||
      rawUser === null ||
      typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
    ) {
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
    const userId = (rawUser as { sub: string }).sub;

    const input = req.body as ProfileBody;
    const now = new Date().toISOString();
    const personaMode: PersonaMode = input.personaMode ?? 'default';

    try {
      const db = getDatabase();

      const existing = db
        .prepare("SELECT id FROM profiles WHERE user_id = ?")
        .get(userId) as { id: string } | undefined;

      const profileId = existing?.id ?? randomUUID();
      const wellnessPrefs = input.wellnessPreferences ?? [];

      if (existing) {
        db.prepare(
          `UPDATE profiles
              SET full_name = ?,
                  date_of_birth = ?,
                  gender = ?,
                  persona_mode = ?,
                  wellness_preferences = ?,
                  updated_at = ?
            WHERE user_id = ?`,
        ).run(
          input.fullName,
          input.dateOfBirth ?? null,
          input.gender ?? null,
          personaMode,
          JSON.stringify(wellnessPrefs),
          now,
          userId,
        );
      } else {
        db.prepare(
          `INSERT INTO profiles
             (id, user_id, persona_mode, full_name, date_of_birth, gender,
              wellness_preferences, focus_areas_json, target_steps,
              privacy_policy_accepted, data_export_requested, data_deletion_requested,
              created_at, updated_at)
           VALUES
             (?, ?, ?, ?, ?, ?, ?, '[]', NULL, 0, 0, 0, ?, ?)`,
        ).run(
          profileId,
          userId,
          personaMode,
          input.fullName,
          input.dateOfBirth ?? null,
          input.gender ?? null,
          JSON.stringify(wellnessPrefs),
          now,
          now,
        );
      }

      const row = db
        .prepare(
          `SELECT id, user_id, full_name, date_of_birth, gender, wellness_preferences,
                  persona_mode, created_at, updated_at
             FROM profiles WHERE user_id = ?`,
        )
        .get(userId) as {
        id: string;
        user_id: string;
        full_name: string;
        date_of_birth: string | null;
        gender: string | null;
        wellness_preferences: string;
        persona_mode: string;
        created_at: string;
        updated_at: string;
      };

      console.log({
        event: "profile.updated",
        userId,
        profileId: row.id,
        correlationId,
      });

      res.status(200).json({
        meta: { correlationId, timestamp: now },
        data: {
          profile: {
            id: row.id,
            userId: row.user_id,
            fullName: row.full_name,
            dateOfBirth: row.date_of_birth,
            gender: row.gender,
            wellnessPreferences: JSON.parse(row.wellness_preferences) as string[],
            personaMode: row.persona_mode,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

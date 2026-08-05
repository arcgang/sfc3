import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection.js";
import { validateBody } from "../middleware/validate.js";

const ALLOWED_GENDERS = ["Male", "Female", "Other", "Prefer not to say"] as const;

const profileSchema = z.object({
  fullName: z.string().min(1, "fullName is required"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(ALLOWED_GENDERS).optional(),
  wellnessPreferences: z.array(z.string()).optional(),
  dashboardMode: z
    .enum(["default", "fitness", "chronic_care_aware"])
    .optional(),
});

type ProfileBody = z.infer<typeof profileSchema>;

export const profileRouter = Router();

profileRouter.put(
  "/",
  validateBody(profileSchema),
  (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";
    const user = res.locals["user"] as { sub?: string; id?: string } | undefined;
    const userId = user?.sub ?? user?.id;

    if (!userId) {
      res.status(401).json({
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: { type: "AUTH_TOKEN_INVALID", details: [] },
      });
      return;
    }

    const { fullName, dateOfBirth, gender, wellnessPreferences, dashboardMode } =
      req.body as ProfileBody;

    const db = getDatabase();
    const now = new Date().toISOString();

    const existing = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get(userId) as { id: string } | undefined;

    const prefsJson = JSON.stringify(wellnessPreferences ?? []);

    const personaMode =
      dashboardMode === "fitness" || dashboardMode === "chronic_care_aware"
        ? dashboardMode
        : "default";

    if (existing) {
      db.prepare(
        `UPDATE profiles
            SET full_name = ?,
                date_of_birth = ?,
                gender = ?,
                wellness_preferences = ?,
                persona_mode = ?,
                updated_at = ?
          WHERE user_id = ?`,
      ).run(
        fullName,
        dateOfBirth ?? null,
        gender ?? null,
        prefsJson,
        personaMode,
        now,
        userId,
      );

      const updated = db
        .prepare("SELECT * FROM profiles WHERE user_id = ?")
        .get(userId) as Record<string, unknown>;

      res.status(200).json({
        meta: { correlationId, timestamp: now },
        data: { profile: updated },
      });
    } else {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO profiles
            (id, user_id, full_name, date_of_birth, gender, wellness_preferences, persona_mode, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        fullName,
        dateOfBirth ?? null,
        gender ?? null,
        prefsJson,
        personaMode,
        now,
        now,
      );

      const created = db
        .prepare("SELECT * FROM profiles WHERE id = ?")
        .get(id) as Record<string, unknown>;

      res.status(200).json({
        meta: { correlationId, timestamp: now },
        data: { profile: created },
      });
    }
  },
);

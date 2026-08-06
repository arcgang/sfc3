import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface InsightRow {
  id: string;
  user_id: string;
  goal_id: string | null;
  insight_type: string;
  generator_name: string | null;
  content: string;
  user_data_only: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface EngagementEventRow {
  id: string;
  user_id: string;
  event_type: string;
  occurred_at: string;
  event_date: string;
  event_timestamp: string;
  event_context_json: string;
  created_at: string;
  updated_at: string;
}

export interface NudgeDismissResult {
  dismissed: InsightRow;
  next_nudge: InsightRow | null;
}

const MIN_HEALTH_RECORDS = 3;

const NUDGES: { content: string }[] = [
  {
    content:
      "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
  },
  {
    content:
      "Consider setting a consistent bedtime alarm for 10:30 PM to maintain your improved sleep schedule.",
  },
  {
    content:
      "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
  },
];

export class RecommendationService {
  constructor(private readonly db: Database.Database) {}

  generate(userId: string): InsightRow[] {
    const countRow = this.db
      .prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM health_records WHERE user_id = ?",
      )
      .get(userId);

    if (!countRow || countRow.count < MIN_HEALTH_RECORDS) {
      return [];
    }

    const now = new Date().toISOString();

    // INSERT OR IGNORE relies on the UNIQUE(user_id, content) constraint added in migration 010.
    const upsert = this.db.prepare<[string, string, string, string, string]>(
      `INSERT OR IGNORE INTO insights
         (id, user_id, insight_type, generator_name, content,
          user_data_only, status, created_at, updated_at)
       VALUES (?, ?, 'nudge', NULL, ?, 1, 'active', ?, ?)`,
    );

    const insertAll = this.db.transaction(() => {
      for (const nudge of NUDGES) {
        upsert.run(randomUUID(), userId, nudge.content, now, now);
      }
    });
    insertAll();

    return this.getActive(userId);
  }

  getActive(userId: string): InsightRow[] {
    return this.db
      .prepare<[string], InsightRow>(
        `SELECT id, user_id, goal_id, insight_type, generator_name,
                content, user_data_only, status, created_at, updated_at
           FROM insights
          WHERE user_id = ?
            AND status  = 'active'
          ORDER BY created_at ASC`,
      )
      .all(userId);
  }

  setStatus(
    id: string,
    userId: string,
    status: "active" | "done" | "dismissed",
  ): InsightRow {
    const existing = this.db
      .prepare<[string], InsightRow>(
        `SELECT id, user_id, goal_id, insight_type, generator_name,
                content, user_data_only, status, created_at, updated_at
           FROM insights
          WHERE id = ?`,
      )
      .get(id);

    if (!existing || existing.user_id !== userId) {
      throw Object.assign(new Error("Insight not found."), { code: "NOT_FOUND" });
    }

    const now = new Date().toISOString();
    this.db
      .prepare<[string, string, string]>(
        "UPDATE insights SET status = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, now, id);

    return { ...existing, status, updated_at: now };
  }

  getNudges(userId: string): InsightRow[] {
    return this.db
      .prepare<[string], InsightRow>(
        `SELECT id, user_id, goal_id, insight_type, generator_name,
                content, user_data_only, status, created_at, updated_at
           FROM insights
          WHERE user_id = ?
            AND status = 'active'
            AND insight_type = 'nudge'
          ORDER BY created_at ASC
          LIMIT 3`,
      )
      .all(userId);
  }

  dismissNudge(id: string, userId: string): NudgeDismissResult {
    const dismissed = this.setStatus(id, userId, "dismissed");
    this._recordEngagementEvent(userId, id);
    const remaining = this.getNudges(userId);
    return { dismissed, next_nudge: remaining[0] ?? null };
  }

  markNudgeDone(id: string, userId: string): NudgeDismissResult {
    const dismissed = this.setStatus(id, userId, "done");
    this._recordEngagementEvent(userId, id);
    const remaining = this.getNudges(userId);
    return { dismissed, next_nudge: remaining[0] ?? null };
  }

  private _recordEngagementEvent(userId: string, nudgeId: string): void {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    this.db
      .prepare<[string, string, string, string, string, string]>(
        `INSERT INTO engagement_events
           (id, user_id, event_type, occurred_at, event_date, event_timestamp, event_context_json)
         VALUES (?, ?, 'nudge_dismiss', ?, ?, ?, ?)`,
      )
      .run(randomUUID(), userId, now, today, now, JSON.stringify({ nudge_id: nudgeId }));
  }
}

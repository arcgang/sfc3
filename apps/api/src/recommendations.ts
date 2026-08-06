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

const MIN_HEALTH_RECORDS = 3;
const MAX_ACTIVE_NUDGES = 3;

// Staleness threshold for device sync (hours)
const STALE_SYNC_HOURS = 48;

// Inactivity threshold: no step records in this many days
const INACTIVITY_DAYS = 3;

interface GoalRow {
  id: string;
  goal_type: string;
  target_value: number;
  target_unit: string;
  status: string;
}

interface MetricSumRow {
  total: number | null;
}

interface LastSyncRow {
  last_sync_at: string | null;
}

interface LastRecordRow {
  last_recorded_at: string | null;
}

// Nudge candidates derived from user data. Each has a `content` string and
// an optional `goal_id` to associate with a specific goal row.
interface NudgeCandidate {
  content: string;
  goal_id: string | null;
}

// Fallback nudges used when contextual rules produce fewer than MAX_ACTIVE_NUDGES candidates.
// These cover the baseline: step goal, sleep routine, hydration.
const FALLBACK_NUDGES: NudgeCandidate[] = [
  {
    content:
      "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    goal_id: null,
  },
  {
    content:
      "Consider setting a consistent bedtime alarm for 10:30 PM to maintain your improved sleep schedule.",
    goal_id: null,
  },
  {
    content:
      "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
    goal_id: null,
  },
];

/**
 * Derives contextual nudge candidates from live user data.
 * Queries goals, recent health records, and device sync status.
 * Returns at most MAX_ACTIVE_NUDGES candidates, prioritising the most actionable.
 */
function deriveContextualNudges(
  userId: string,
  db: Database.Database,
  nowIso: string,
): NudgeCandidate[] {
  const candidates: NudgeCandidate[] = [];

  // ── Step-goal nudge ────────────────────────────────────────────────────────
  const stepsGoal = db
    .prepare<[string], GoalRow>(
      `SELECT id, goal_type, target_value, target_unit, status
         FROM goals
        WHERE user_id = ?
          AND goal_type = 'steps_daily'
          AND status IN ('active','on_track','behind')
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(userId);

  if (stepsGoal) {
    const todayStr = nowIso.slice(0, 10);
    const stepRow = db
      .prepare<[string, string], MetricSumRow>(
        `SELECT SUM(value) AS total
           FROM health_records
          WHERE user_id = ?
            AND metric_name = 'step_count'
            AND substr(recorded_at, 1, 10) = ?`,
      )
      .get(userId, todayStr);

    const todaySteps = stepRow?.total ?? 0;
    const target = stepsGoal.target_value;

    if (todaySteps < target * 0.5) {
      candidates.push({
        content: `You're less than halfway to your ${Math.round(target).toLocaleString("en-US")}-step goal today. A short walk now can help you catch up.`,
        goal_id: stepsGoal.id,
      });
    } else if (todaySteps < target) {
      candidates.push({
        content: `You're over halfway to your step goal — just ${Math.round(target - todaySteps).toLocaleString("en-US")} more steps to go. Keep it up!`,
        goal_id: stepsGoal.id,
      });
    }
  }

  // ── Sleep-goal nudge ───────────────────────────────────────────────────────
  const sleepGoal = db
    .prepare<[string], GoalRow>(
      `SELECT id, goal_type, target_value, target_unit, status
         FROM goals
        WHERE user_id = ?
          AND goal_type = 'sleep_minutes_daily'
          AND status IN ('active','on_track','behind')
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(userId);

  if (sleepGoal) {
    const sevenDaysAgo = new Date(nowIso);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const windowStart = sevenDaysAgo.toISOString().slice(0, 10);
    const todayStr = nowIso.slice(0, 10);

    const sleepRow = db
      .prepare<[string, string, string], MetricSumRow>(
        `SELECT AVG(daily_sum) AS total
           FROM (
             SELECT substr(recorded_at, 1, 10) AS day, SUM(value) AS daily_sum
               FROM health_records
              WHERE user_id = ?
                AND metric_name = 'sleep_minutes'
                AND substr(recorded_at, 1, 10) >= ?
                AND substr(recorded_at, 1, 10) <= ?
              GROUP BY day
           )`,
      )
      .get(userId, windowStart, todayStr);

    const avgSleep = sleepRow?.total ?? null;
    const targetMinutes = sleepGoal.target_value;

    if (avgSleep !== null && avgSleep < targetMinutes * 0.85) {
      const targetHours = Math.round(targetMinutes / 60);
      candidates.push({
        content: `Your recent sleep is below your ${targetHours}-hour goal. Try winding down 30 minutes earlier tonight to build a more consistent routine.`,
        goal_id: sleepGoal.id,
      });
    }
  }

  // ── Stale device sync nudge ────────────────────────────────────────────────
  const syncRow = db
    .prepare<[string], LastSyncRow>(
      `SELECT last_sync_at
         FROM device_connections
        WHERE user_id = ?
          AND connection_status = 'connected'
        ORDER BY last_sync_at DESC
        LIMIT 1`,
    )
    .get(userId);

  if (syncRow?.last_sync_at) {
    const lastSyncMs = new Date(syncRow.last_sync_at).getTime();
    const nowMs = new Date(nowIso).getTime();
    const hoursSinceSync = (nowMs - lastSyncMs) / 3_600_000;

    if (hoursSinceSync >= STALE_SYNC_HOURS) {
      candidates.push({
        content:
          "Your device hasn't synced in a couple of days. Open the app and sync to make sure your latest health data is up to date.",
        goal_id: null,
      });
    }
  }

  // ── Recent inactivity nudge ────────────────────────────────────────────────
  const inactivityCutoff = new Date(nowIso);
  inactivityCutoff.setUTCDate(inactivityCutoff.getUTCDate() - INACTIVITY_DAYS);
  const cutoffStr = inactivityCutoff.toISOString().slice(0, 10);

  const recentActivity = db
    .prepare<[string, string], LastRecordRow>(
      `SELECT MAX(substr(recorded_at, 1, 10)) AS last_recorded_at
         FROM health_records
        WHERE user_id = ?
          AND metric_name = 'step_count'
          AND substr(recorded_at, 1, 10) >= ?`,
    )
    .get(userId, cutoffStr);

  if (!recentActivity?.last_recorded_at) {
    candidates.push({
      content:
        "It looks like you haven't been active for the last few days. Even a short 10-minute walk can help you get back on track.",
      goal_id: null,
    });
  }

  // ── Hydration nudge (goal-linked if a daily-steps goal is active) ──────────
  // Always relevant when user is active; linked to step goal for context.
  if (stepsGoal || candidates.length < MAX_ACTIVE_NUDGES) {
    candidates.push({
      content:
        "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
      goal_id: stepsGoal?.id ?? null,
    });
  }

  return candidates.slice(0, MAX_ACTIVE_NUDGES);
}

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

    // Derive contextual nudge candidates from the user's live data.
    const contextual = deriveContextualNudges(userId, this.db, now);

    // Fill remaining slots from fallback nudges whose content isn't already covered.
    const contextualContents = new Set(contextual.map((n) => n.content));
    const filledCandidates = [...contextual];
    for (const fallback of FALLBACK_NUDGES) {
      if (filledCandidates.length >= MAX_ACTIVE_NUDGES) break;
      if (!contextualContents.has(fallback.content)) {
        filledCandidates.push(fallback);
      }
    }

    // INSERT OR IGNORE relies on the UNIQUE(user_id, content) constraint added in migration 010.
    const upsert = this.db.prepare<[string, string, string | null, string, string, string]>(
      `INSERT OR IGNORE INTO insights
         (id, user_id, goal_id, insight_type, generator_name, content,
          user_data_only, status, created_at, updated_at)
       VALUES (?, ?, ?, 'nudge', NULL, ?, 1, 'active', ?, ?)`,
    );

    const insertAll = this.db.transaction(() => {
      for (const nudge of filledCandidates) {
        upsert.run(randomUUID(), userId, nudge.goal_id, nudge.content, now, now);
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

  dismissNudge(id: string, userId: string): InsightRow {
    const updated = this.setStatus(id, userId, "dismissed");
    this._recordEngagementEvent(userId, id);
    return updated;
  }

  markNudgeDone(id: string, userId: string): InsightRow {
    const updated = this.setStatus(id, userId, "done");
    this._recordEngagementEvent(userId, id);
    return updated;
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

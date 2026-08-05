import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

const DESIGN_GOALS = [
  {
    goalType: "steps_daily",
    targetValue: 10000,
    targetUnit: "steps",
    cadence: "daily",
    metricDomain: "activity",
    metricType: "steps",
    name: "Walk 10,000 steps daily",
    icon: "👟",
  },
  {
    goalType: "sleep_minutes_daily",
    targetValue: 420,
    targetUnit: "minutes",
    cadence: "daily",
    metricDomain: "sleep",
    metricType: "sleep_minutes",
    name: "Sleep 7+ hours nightly",
    icon: "😴",
  },
  {
    goalType: "weight_target",
    targetValue: 172.7,
    targetUnit: "lbs",
    cadence: "daily",
    metricDomain: "body_composition",
    metricType: "weight",
    name: "Lose 5 lbs this month",
    icon: "⚖️",
  },
  {
    goalType: "active_minutes_weekly",
    targetValue: 150,
    targetUnit: "minutes",
    cadence: "weekly",
    metricDomain: "activity",
    metricType: "active_minutes",
    name: "Exercise 150 minutes weekly",
    icon: "🏃",
  },
  {
    goalType: "steps_daily",
    targetValue: 8,
    targetUnit: "glasses",
    cadence: "daily",
    metricDomain: "activity",
    metricType: "water_glasses",
    name: "Drink 8 glasses of water daily",
    icon: "💧",
  },
] as const;

const DESIGN_INSIGHTS = [
  {
    title: "Consistency Pays Off",
    body: "You've hit your step goal 5 days in a row. Maintaining this consistency will help you reach your monthly activity target ahead of schedule.",
    insightType: "recommendation",
  },
  {
    title: "Weight Loss Strategy",
    body: "To get back on track with your weight goal, try increasing your weekly exercise by 30 minutes and tracking your calorie intake more closely.",
    insightType: "recommendation",
  },
] as const;

/**
 * Inserts the five design example goals and two goal_insights rows for a user.
 * No-op if any goals already exist for that user.
 * Only intended for use when NODE_ENV=development.
 */
export function seedGoalsForUser(db: Database.Database, userId: string): void {
  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM goals WHERE user_id = ?")
    .get(userId) as { cnt: number };
  if (existing.cnt > 0) return;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // Compute a start date one week ago for the month-long weight goal
  const monthStart = new Date(new Date().getTime() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(new Date().getTime() + 23 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  db.transaction(() => {
    const goalIds: string[] = [];

    for (const g of DESIGN_GOALS) {
      const goalId = randomUUID();
      goalIds.push(goalId);

      const startDate = g.goalType === "weight_target" ? monthStart : today;
      const endDate = g.goalType === "weight_target" ? monthEnd : null;

      db.prepare(
        `INSERT INTO goals
           (id, user_id, goal_type, target_value, target_unit, cadence,
            start_date, end_date, status, created_at, updated_at,
            name, icon, metric_domain, metric_type)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      ).run(
        goalId,
        userId,
        g.goalType,
        g.targetValue,
        g.targetUnit,
        g.cadence,
        startDate,
        endDate,
        now,
        now,
        g.name,
        g.icon,
        g.metricDomain,
        g.metricType,
      );
    }

    for (const ins of DESIGN_INSIGHTS) {
      db.prepare(
        `INSERT INTO goal_insights (id, user_id, goal_id, title, body, insight_type, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
      ).run(randomUUID(), userId, ins.title, ins.body, ins.insightType, now);
    }
  })();
}

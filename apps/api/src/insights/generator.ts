import type Database from "better-sqlite3";

export interface InsightObject {
  category: string;
  title: string;
  narrative: string;
  icon: string;
  link_label: "Learn More →" | "View Progress →" | "View Trends →";
}

// Step threshold for the ActivityStreak insight (consecutive days ≥ this count).
const ACTIVITY_STREAK_STEP_THRESHOLD = 10000;
const ACTIVITY_STREAK_MIN_DAYS = 7;

// Minimum absolute change in body_fat_percentage to emit a BodyCompositionTrend insight.
const BODY_FAT_CHANGE_THRESHOLD = 0.5;

interface DayAvgRow {
  day: string;
  avg_value: number;
}

interface DayMaxRow {
  day: string;
  max_value: number;
}

interface AvgStdRow {
  avg_value: number;
  std_value: number;
}

interface DayValueRow {
  day: string;
  value: number;
}

/**
 * Returns the Monday ISO date (YYYY-MM-DD) for the calendar week containing `d`.
 */
function weekStart(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, …
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sleepQualityImproved(userId: string, db: Database.Database, today: Date): InsightObject | null {
  const thisMonStart = weekStart(today);
  const prevMonStart = new Date(thisMonStart);
  prevMonStart.setUTCDate(prevMonStart.getUTCDate() - 7);
  const prevSunEnd = new Date(thisMonStart);
  prevSunEnd.setUTCDate(prevSunEnd.getUTCDate() - 1);

  const thisWeekStart = toDateStr(thisMonStart);
  const todayStr = toDateStr(today);
  const prevWeekStart = toDateStr(prevMonStart);
  const prevWeekEnd = toDateStr(prevSunEnd);

  interface AvgRow { avg_min: number | null }

  const thisRow = db.prepare(
    `SELECT AVG(daily_sum) AS avg_min
       FROM (
         SELECT substr(recorded_at, 1, 10) AS day, SUM(value) AS daily_sum
           FROM health_records
          WHERE user_id     = ?
            AND metric_name = 'sleep_minutes'
            AND substr(recorded_at, 1, 10) >= ?
            AND substr(recorded_at, 1, 10) <= ?
          GROUP BY day
       )`,
  ).get(userId, thisWeekStart, todayStr) as AvgRow | undefined;

  const prevRow = db.prepare(
    `SELECT AVG(daily_sum) AS avg_min
       FROM (
         SELECT substr(recorded_at, 1, 10) AS day, SUM(value) AS daily_sum
           FROM health_records
          WHERE user_id     = ?
            AND metric_name = 'sleep_minutes'
            AND substr(recorded_at, 1, 10) >= ?
            AND substr(recorded_at, 1, 10) <= ?
          GROUP BY day
       )`,
  ).get(userId, prevWeekStart, prevWeekEnd) as AvgRow | undefined;

  const thisAvg = thisRow?.avg_min ?? null;
  const prevAvg = prevRow?.avg_min ?? null;

  if (thisAvg === null || prevAvg === null) return null;
  if (thisAvg <= prevAvg) return null;

  return {
    category: "SleepQualityImproved",
    title: "Your sleep is trending better",
    narrative:
      "Over the past week, your average time asleep increased and you woke up less often. Nice work — consistency tends to help.",
    icon: "💤",
    link_label: "View Trends →",
  };
}

function activityStreak(userId: string, db: Database.Database, today: Date): InsightObject | null {
  const todayStr = toDateStr(today);
  // Look back enough days to find a streak of >= ACTIVITY_STREAK_MIN_DAYS
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - (ACTIVITY_STREAK_MIN_DAYS - 1));
  const windowStartStr = toDateStr(windowStart);

  const rows = db.prepare(
    `SELECT substr(recorded_at, 1, 10) AS day,
            MAX(value)                 AS max_value
       FROM health_records
      WHERE user_id     = ?
        AND metric_name = 'step_count'
        AND substr(recorded_at, 1, 10) >= ?
        AND substr(recorded_at, 1, 10) <= ?
      GROUP BY day
      ORDER BY day DESC`,
  ).all(userId, windowStartStr, todayStr) as DayMaxRow[];

  if (rows.length === 0) return null;

  // Walk backwards from today counting consecutive days with steps >= threshold
  let streak = 0;
  let cursor = today;
  const dayMap = new Map(rows.map((r) => [r.day, r.max_value]));

  for (let i = 0; i < ACTIVITY_STREAK_MIN_DAYS; i++) {
    const dayStr = toDateStr(cursor);
    const steps = dayMap.get(dayStr) ?? 0;
    if (steps >= ACTIVITY_STREAK_STEP_THRESHOLD) {
      streak++;
    } else {
      break;
    }
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  if (streak < ACTIVITY_STREAK_MIN_DAYS) return null;

  return {
    category: "ActivityStreak",
    title: "7 days of movement in a row",
    narrative:
      "You've hit your activity goal seven days running. Streaks like this are a great way to build a habit",
    icon: "🎯",
    link_label: "View Progress →",
  };
}

function heartRateVariability(userId: string, db: Database.Database, today: Date): InsightObject | null {
  const todayStr = toDateStr(today);
  const fourWeeksAgo = new Date(today);
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);
  const fourWeeksAgoStr = toDateStr(fourWeeksAgo);

  const thisMonStart = weekStart(today);
  const thisWeekStartStr = toDateStr(thisMonStart);

  // Rolling 4-week daily HRV averages for baseline statistics
  const baselineRows = db.prepare(
    `SELECT substr(recorded_at, 1, 10) AS day,
            AVG(value)                 AS avg_value
       FROM health_records
      WHERE user_id     = ?
        AND metric_name = 'hrv'
        AND substr(recorded_at, 1, 10) >= ?
        AND substr(recorded_at, 1, 10) < ?
      GROUP BY day`,
  ).all(userId, fourWeeksAgoStr, thisWeekStartStr) as DayAvgRow[];

  if (baselineRows.length < 2) return null;

  const mean = baselineRows.reduce((s, r) => s + r.avg_value, 0) / baselineRows.length;
  const variance =
    baselineRows.reduce((s, r) => s + (r.avg_value - mean) ** 2, 0) / baselineRows.length;
  const sd = Math.sqrt(variance);

  if (sd === 0) return null;

  // Daily averages this calendar week
  const thisWeekRows = db.prepare(
    `SELECT substr(recorded_at, 1, 10) AS day,
            AVG(value)                 AS avg_value
       FROM health_records
      WHERE user_id     = ?
        AND metric_name = 'hrv'
        AND substr(recorded_at, 1, 10) >= ?
        AND substr(recorded_at, 1, 10) <= ?
      GROUP BY day`,
  ).all(userId, thisWeekStartStr, todayStr) as DayAvgRow[];

  if (thisWeekRows.length === 0) return null;

  const lower = mean - sd;
  const upper = mean + sd;
  const hasOutlier = thisWeekRows.some((r) => r.avg_value < lower || r.avg_value > upper);

  if (!hasOutlier) return null;

  return {
    category: "HeartRateVariability",
    title: "Your HRV pattern this week",
    narrative:
      "Your heart rate variability was lower than your typical range on a few days. HRV naturally fluctuates with things like sleep, stress, and activity",
    icon: "❤️",
    link_label: "View Trends →",
  };
}

function bodyCompositionTrend(userId: string, db: Database.Database, today: Date): InsightObject | null {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth(); // 0-based

  const thisMonthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const todayStr = toDateStr(today);

  // Previous month: use UTC Date constructor to avoid local-timezone drift
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 12 : month; // 1-based month number of previous month
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  // Last day of previous month = day 0 of current month in UTC
  const prevMonthEnd = new Date(Date.UTC(year, month, 0));
  const prevMonthEndStr = toDateStr(prevMonthEnd);

  interface MonthAvgRow { avg_fat: number | null }

  const thisRow = db.prepare(
    `SELECT AVG(value) AS avg_fat
       FROM health_records
      WHERE user_id     = ?
        AND metric_name = 'body_fat_pct'
        AND substr(recorded_at, 1, 10) >= ?
        AND substr(recorded_at, 1, 10) <= ?`,
  ).get(userId, thisMonthStart, todayStr) as MonthAvgRow | undefined;

  const prevRow = db.prepare(
    `SELECT AVG(value) AS avg_fat
       FROM health_records
      WHERE user_id     = ?
        AND metric_name = 'body_fat_pct'
        AND substr(recorded_at, 1, 10) >= ?
        AND substr(recorded_at, 1, 10) <= ?`,
  ).get(userId, prevMonthStart, prevMonthEndStr) as MonthAvgRow | undefined;

  const thisAvg = thisRow?.avg_fat ?? null;
  const prevAvg = prevRow?.avg_fat ?? null;

  if (thisAvg === null || prevAvg === null) return null;
  if (Math.abs(thisAvg - prevAvg) < BODY_FAT_CHANGE_THRESHOLD) return null;

  return {
    category: "BodyCompositionTrend",
    title: "A shift in your body composition",
    narrative:
      "Your recorded measurements show a gradual change over the last month. Trends are easier to read over weeks than day to day.",
    icon: "⚖️",
    link_label: "View Progress →",
  };
}

/**
 * Generates 0–4 insights for the given user, querying ONLY rows belonging to that user.
 * insights.user_data_only=1 is enforced: every query filters by userId.
 */
export async function generateInsights(
  userId: string,
  db: Database.Database,
  now: Date = new Date(),
): Promise<InsightObject[]> {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const results: InsightObject[] = [];

  const sleep = sleepQualityImproved(userId, db, today);
  if (sleep) results.push(sleep);

  const streak = activityStreak(userId, db, today);
  if (streak) results.push(streak);

  const hrv = heartRateVariability(userId, db, today);
  if (hrv) results.push(hrv);

  const body = bodyCompositionTrend(userId, db, today);
  if (body) results.push(body);

  return results;
}

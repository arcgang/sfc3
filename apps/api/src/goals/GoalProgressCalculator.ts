export type GoalStatus = "on_track" | "at_risk" | "missed" | "completed" | "archived";

export interface GoalInput {
  goalType: string;
  targetValue: number;
  targetUnit: string;
  cadence: "daily" | "weekly";
  startDate: string;
  endDate?: string | null;
}

export interface HealthRecordInput {
  metricName: string;
  value: number;
  unit: string | null;
  recordedAt: string;
}

export interface GoalProgress {
  currentValue: number;
  currentDisplay: string;
  weekOverWeekChange: string;
  status: GoalStatus;
  progressPercent: number;
}

interface WeeklyRecords {
  thisWeek: HealthRecordInput[];
  lastWeek: HealthRecordInput[];
}

function formatSteps(value: number): string {
  return `${value.toLocaleString("en-US")} steps`;
}

function formatMinutesAsHoursAndMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatWeight(value: number, unit: string): string {
  return `${value} ${unit}`;
}

function formatMinutes(value: number, unit: string): string {
  if (unit === "minutes") return formatMinutesAsHoursAndMinutes(value);
  return `${value} ${unit}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isoDateToMidnight(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function isArchived(endDate: string | null | undefined, today: Date): boolean {
  if (!endDate) return false;
  return isoDateToMidnight(endDate) < today;
}

function latestValueForPeriod(records: HealthRecordInput[]): number {
  if (records.length === 0) return 0;
  // Pick the record with the most recent recordedAt
  const sorted = [...records].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
  return sorted[0]!.value;
}

function sumValuesForPeriod(records: HealthRecordInput[]): number {
  return records.reduce((acc, r) => acc + r.value, 0);
}

/**
 * Split a list of records into this-week and last-week buckets relative to
 * the supplied anchor date (ISO date string, e.g. today).
 * Buckets are based on date string comparison (YYYY-MM-DD prefix) so that
 * time-of-day does not affect which period a record falls into.
 */
function splitWeeks(
  records: HealthRecordInput[],
  anchorDateStr: string,
): WeeklyRecords {
  const anchor = isoDateToMidnight(anchorDateStr);
  const weekStartDate = new Date(anchor.getTime() - 6 * 86_400_000);
  const prevWeekStartDate = new Date(weekStartDate.getTime() - 7 * 86_400_000);

  const weekStartStr = weekStartDate.toISOString().slice(0, 10);
  const prevWeekStartStr = prevWeekStartDate.toISOString().slice(0, 10);

  const thisWeek = records.filter((r) => {
    const d = r.recordedAt.slice(0, 10);
    return d >= weekStartStr && d <= anchorDateStr;
  });
  const lastWeek = records.filter((r) => {
    const d = r.recordedAt.slice(0, 10);
    return d >= prevWeekStartStr && d < weekStartStr;
  });
  return { thisWeek, lastWeek };
}

function stepsProgress(
  goal: GoalInput,
  records: HealthRecordInput[],
  today: Date,
): GoalProgress {
  const todayStr = today.toISOString().slice(0, 10);
  const { thisWeek, lastWeek } = splitWeeks(records, todayStr);

  // Use latest reading for today as the current value
  const todayRecords = records.filter(
    (r) => r.recordedAt.slice(0, 10) === todayStr,
  );
  const current = todayRecords.length > 0 ? latestValueForPeriod(todayRecords) : 0;
  const progressPercent = clamp(Math.round((current / goal.targetValue) * 100), 0, 100);

  const status: GoalStatus =
    current >= goal.targetValue
      ? "completed"
      : current === 0
        ? "missed"
        : current >= goal.targetValue * 0.85
          ? "on_track"
          : "at_risk";

  // Week-over-week: average steps for this week vs last week
  const thisAvg =
    thisWeek.length > 0 ? thisWeek.reduce((a, r) => a + r.value, 0) / thisWeek.length : 0;
  const lastAvg =
    lastWeek.length > 0 ? lastWeek.reduce((a, r) => a + r.value, 0) / lastWeek.length : 0;

  let weekOverWeekChange: string;
  if (lastAvg === 0 || thisWeek.length === 0) {
    weekOverWeekChange = "No comparison data available";
  } else {
    const pct = Math.round(((thisAvg - lastAvg) / lastAvg) * 100);
    weekOverWeekChange =
      pct >= 0 ? `Up ${pct}% from last week` : `Down ${Math.abs(pct)}% from last week`;
  }

  return {
    currentValue: current,
    currentDisplay: formatSteps(current),
    weekOverWeekChange,
    status,
    progressPercent,
  };
}

function sleepProgress(
  goal: GoalInput,
  records: HealthRecordInput[],
  today: Date,
): GoalProgress {
  const todayStr = today.toISOString().slice(0, 10);
  const { thisWeek, lastWeek } = splitWeeks(records, todayStr);

  const todayRecords = records.filter(
    (r) => r.recordedAt.slice(0, 10) === todayStr,
  );
  const current = todayRecords.length > 0 ? latestValueForPeriod(todayRecords) : 0;
  const progressPercent = clamp(Math.round((current / goal.targetValue) * 100), 0, 100);

  const status: GoalStatus =
    current >= goal.targetValue
      ? "completed"
      : current === 0
        ? "missed"
        : current >= goal.targetValue * 0.85
          ? "on_track"
          : "at_risk";

  // Week-over-week: average sleep this week vs last
  const thisAvg =
    thisWeek.length > 0 ? thisWeek.reduce((a, r) => a + r.value, 0) / thisWeek.length : 0;
  const lastAvg =
    lastWeek.length > 0 ? lastWeek.reduce((a, r) => a + r.value, 0) / lastWeek.length : 0;

  let weekOverWeekChange: string;
  if (lastAvg === 0 || thisWeek.length === 0) {
    weekOverWeekChange = "No comparison data available";
  } else {
    const diffMin = Math.round(thisAvg - lastAvg);
    weekOverWeekChange =
      diffMin >= 0
        ? `Improved by ${diffMin} minutes this week`
        : `Down ${Math.abs(diffMin)} minutes this week`;
  }

  return {
    currentValue: current,
    currentDisplay: formatMinutes(current, goal.targetUnit || "minutes"),
    weekOverWeekChange,
    status,
    progressPercent,
  };
}

function weightProgress(
  goal: GoalInput,
  records: HealthRecordInput[],
  today: Date,
): GoalProgress {
  const todayStr = today.toISOString().slice(0, 10);
  if (records.length === 0) {
    return {
      currentValue: 0,
      currentDisplay: formatWeight(0, goal.targetUnit || "lbs"),
      weekOverWeekChange: "No comparison data available",
      status: "missed",
      progressPercent: 0,
    };
  }

  const current = latestValueForPeriod(records);

  // Weight target: lower is better; completed if current <= targetValue
  const status: GoalStatus =
    current <= goal.targetValue
      ? "completed"
      : (() => {
          if (!goal.startDate) return "at_risk";
          // Linear pace: how much weight should have been lost by now
          const startDate = isoDateToMidnight(goal.startDate);
          const endDate = goal.endDate
            ? isoDateToMidnight(goal.endDate)
            : new Date(startDate.getTime() + 30 * 86_400_000); // default 30 days
          const totalDays = daysBetween(startDate, endDate);
          const elapsed = daysBetween(startDate, today);
          if (totalDays <= 0 || elapsed <= 0) return "at_risk";

          // Start weight: use earliest record or use a rough approximation
          const earliest = [...records].sort((a, b) =>
            a.recordedAt.localeCompare(b.recordedAt),
          )[0]!;
          const startWeight = earliest.value;
          const totalLoss = startWeight - goal.targetValue;
          const expectedLoss = (elapsed / totalDays) * totalLoss;
          const actualLoss = startWeight - current;

          if (actualLoss >= expectedLoss * 0.85) return "on_track";
          if (actualLoss <= 0) return "missed";
          return "at_risk";
        })();

  // Week-over-week: latest this week vs latest last week
  const { thisWeek, lastWeek } = splitWeeks(records, todayStr);
  const thisLatest = thisWeek.length > 0 ? latestValueForPeriod(thisWeek) : null;
  const lastLatest = lastWeek.length > 0 ? latestValueForPeriod(lastWeek) : null;

  let weekOverWeekChange: string;
  if (thisLatest === null || lastLatest === null) {
    weekOverWeekChange = "Behind pace for monthly target";
  } else {
    const diff = Math.round((thisLatest - lastLatest) * 10) / 10;
    if (diff < 0) {
      weekOverWeekChange = `Down ${Math.abs(diff)} ${goal.targetUnit || "lbs"} from last week`;
    } else if (diff > 0) {
      weekOverWeekChange = "Behind pace for monthly target";
    } else {
      weekOverWeekChange = "No change from last week";
    }
  }

  // Progress = how much of the loss goal is achieved (clamped 0-100)
  let progressPercent = 0;
  if (records.length > 0) {
    const earliest = [...records].sort((a, b) =>
      a.recordedAt.localeCompare(b.recordedAt),
    )[0]!;
    const startWeight = earliest.value;
    const totalLoss = startWeight - goal.targetValue;
    if (totalLoss > 0) {
      const actualLoss = startWeight - current;
      progressPercent = clamp(Math.round((actualLoss / totalLoss) * 100), 0, 100);
    } else {
      progressPercent = status === "completed" ? 100 : 0;
    }
  }

  return {
    currentValue: current,
    currentDisplay: formatWeight(current, goal.targetUnit || "lbs"),
    weekOverWeekChange,
    status,
    progressPercent,
  };
}

function activeMinutesProgress(
  goal: GoalInput,
  records: HealthRecordInput[],
  today: Date,
): GoalProgress {
  const todayStr = today.toISOString().slice(0, 10);
  const { thisWeek, lastWeek } = splitWeeks(records, todayStr);

  const thisWeekTotal = sumValuesForPeriod(thisWeek);
  const lastWeekTotal = sumValuesForPeriod(lastWeek);

  const current = thisWeekTotal;
  const progressPercent = clamp(Math.round((current / goal.targetValue) * 100), 0, 100);

  // Days elapsed since goal started (or since the start of the 7-day window, whichever is later)
  const anchor = isoDateToMidnight(todayStr);
  const windowStart = new Date(anchor.getTime() - 6 * 86_400_000);
  const goalStart = goal.startDate ? isoDateToMidnight(goal.startDate) : windowStart;
  const effectiveStart = goalStart > windowStart ? goalStart : windowStart;
  const daysElapsed = Math.max(1, daysBetween(effectiveStart, anchor) + 1);
  const daysRemaining = Math.max(0, 7 - daysElapsed);

  const status: GoalStatus =
    current >= goal.targetValue
      ? "completed"
      : current === 0 && daysElapsed >= 7
        ? "missed"
        : (() => {
            const pace = (current / daysElapsed) * 7;
            if (pace >= goal.targetValue) return "on_track";
            if (pace >= goal.targetValue * 0.7) return "at_risk";
            return "missed";
          })();

  let weekOverWeekChange: string;
  if (lastWeekTotal === 0) {
    weekOverWeekChange = `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining this week`;
  } else {
    const diff = thisWeekTotal - lastWeekTotal;
    if (diff > 0) {
      weekOverWeekChange = `Up ${diff} minutes from last week`;
    } else if (diff < 0) {
      weekOverWeekChange = `Down ${Math.abs(diff)} minutes from last week`;
    } else {
      weekOverWeekChange = `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining this week`;
    }
  }

  return {
    currentValue: current,
    currentDisplay: formatMinutes(current, goal.targetUnit || "minutes"),
    weekOverWeekChange,
    status,
    progressPercent,
  };
}

function waterProgress(
  goal: GoalInput,
  records: HealthRecordInput[],
  today: Date,
): GoalProgress {
  const todayStr = today.toISOString().slice(0, 10);
  const { thisWeek, lastWeek } = splitWeeks(records, todayStr);

  const todayRecords = records.filter(
    (r) => r.recordedAt.slice(0, 10) === todayStr,
  );
  const current = todayRecords.length > 0 ? latestValueForPeriod(todayRecords) : 0;
  const progressPercent = clamp(Math.round((current / goal.targetValue) * 100), 0, 100);

  // Yesterday: check if it was missed
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  const yesterdayRecords = records.filter(
    (r) => r.recordedAt.slice(0, 10) === yesterday,
  );
  const yesterdayValue = yesterdayRecords.length > 0 ? latestValueForPeriod(yesterdayRecords) : 0;
  const missedYesterday = yesterdayValue < goal.targetValue;

  const status: GoalStatus =
    current >= goal.targetValue
      ? "completed"
      : current === 0 && missedYesterday
        ? "missed"
        : current === 0
          ? "at_risk"
          : current >= goal.targetValue * 0.5
            ? "at_risk"
            : "missed";

  const thisAvg =
    thisWeek.length > 0 ? thisWeek.reduce((a, r) => a + r.value, 0) / thisWeek.length : 0;
  const lastAvg =
    lastWeek.length > 0 ? lastWeek.reduce((a, r) => a + r.value, 0) / lastWeek.length : 0;

  let weekOverWeekChange: string;
  if (missedYesterday && current < goal.targetValue) {
    weekOverWeekChange = "Missed yesterday — try to catch up today";
  } else if (lastAvg === 0 || thisWeek.length === 0) {
    weekOverWeekChange = "No comparison data available";
  } else {
    const diff = Math.round(thisAvg - lastAvg);
    weekOverWeekChange =
      diff >= 0
        ? `Up ${diff} glasses from last week average`
        : `Down ${Math.abs(diff)} glasses from last week average`;
  }

  return {
    currentValue: current,
    currentDisplay: `${current}/${goal.targetValue} glasses`,
    weekOverWeekChange,
    status,
    progressPercent,
  };
}

/**
 * Compute goal progress from a goal definition and a set of matching health records.
 *
 * @param goal - The goal definition including type, target, cadence, dates.
 * @param records - Health records whose metric_domain and metric_type match the goal.
 * @param today - The reference date to evaluate staleness and progress (injectable for tests).
 */
export function calculateGoalProgress(
  goal: GoalInput,
  records: HealthRecordInput[],
  today: Date = new Date(),
): GoalProgress {
  const todayMidnight = isoDateToMidnight(today.toISOString().slice(0, 10));

  // Archived takes precedence over all other statuses
  if (isArchived(goal.endDate, todayMidnight)) {
    const lastRecord = records.length > 0 ? latestValueForPeriod(records) : 0;
    return {
      currentValue: lastRecord,
      currentDisplay: `${lastRecord} ${goal.targetUnit}`,
      weekOverWeekChange: "Goal period has ended",
      status: "archived",
      progressPercent: clamp(Math.round((lastRecord / goal.targetValue) * 100), 0, 100),
    };
  }

  switch (goal.goalType) {
    case "steps_daily":
      return stepsProgress(goal, records, todayMidnight);
    case "sleep_minutes_daily":
      return sleepProgress(goal, records, todayMidnight);
    case "weight_target":
      return weightProgress(goal, records, todayMidnight);
    case "active_minutes_weekly":
      return activeMinutesProgress(goal, records, todayMidnight);
    default:
      // Treat unknown goal types like a generic daily water goal shape
      return waterProgress(goal, records, todayMidnight);
  }
}

import { describe, it, expect } from "vitest";
import { calculateGoalProgress } from "./GoalProgressCalculator.js";
import type { GoalInput, HealthRecordInput } from "./GoalProgressCalculator.js";

// Fixed anchor date for all tests: 2026-07-21 (Tuesday)
const TODAY = new Date("2026-07-21T12:00:00Z");
const TODAY_STR = "2026-07-21";
const YESTERDAY_STR = "2026-07-20";
const LAST_WEEK_STR = "2026-07-14"; // 7 days ago

function makeRecord(
  value: number,
  dateStr: string,
  metricName = "steps",
  unit: string | null = null,
): HealthRecordInput {
  return {
    metricName,
    value,
    unit,
    recordedAt: `${dateStr}T10:00:00Z`,
  };
}

// ---------------------------------------------------------------------------
// steps_daily
// ---------------------------------------------------------------------------

describe("GoalProgressCalculator — steps_daily — on_track", () => {
  it("returns status on_track when today's steps >= 85% of target", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(8543, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("on_track");
  });

  it("returns currentValue equal to today's step count (8543)", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(8543, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.currentValue).toBe(8543);
  });

  it("returns currentDisplay containing '8,543 steps'", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(8543, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.currentDisplay).toBe("8,543 steps");
  });

  it("returns progressPercent equal to 85 when steps are 8500/10000", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(8500, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.progressPercent).toBe(85);
  });

  it("includes week-over-week percentage when last week data exists", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    // today in this-week window (July 15–21); 8 days ago in last-week window (July 8–14)
    const records: HealthRecordInput[] = [
      makeRecord(8543, TODAY_STR, "steps"),
      makeRecord(8136, "2026-07-13", "steps"), // 8 days ago
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    // 8543 vs 8136 → about 5% up
    expect(result.weekOverWeekChange).toMatch(/Up \d+% from last week/);
  });
});

describe("GoalProgressCalculator — steps_daily — at_risk", () => {
  it("returns status at_risk when today's steps are below 85% of target but > 0", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(5000, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("at_risk");
  });
});

describe("GoalProgressCalculator — steps_daily — missed", () => {
  it("returns status missed when no records exist for today", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };

    const result = calculateGoalProgress(goal, [], TODAY);

    expect(result.status).toBe("missed");
  });

  it("returns currentValue 0 when no records exist for today", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };

    const result = calculateGoalProgress(goal, [], TODAY);

    expect(result.currentValue).toBe(0);
  });
});

describe("GoalProgressCalculator — steps_daily — completed", () => {
  it("returns status completed when today's steps >= targetValue", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(10220, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("completed");
  });

  it("returns progressPercent 100 when steps equal targetValue", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(10000, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.progressPercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// sleep_minutes_daily
// ---------------------------------------------------------------------------

describe("GoalProgressCalculator — sleep_minutes_daily — on_track", () => {
  it("returns status on_track when sleep minutes are >= 85% of target but < target", () => {
    const goal: GoalInput = {
      goalType: "sleep_minutes_daily",
      targetValue: 480, // 8 hours
      targetUnit: "minutes",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    // 7h 23m = 443 minutes = 92% of 480 → on_track
    const records: HealthRecordInput[] = [makeRecord(443, TODAY_STR, "sleep_minutes", "minutes")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("on_track");
  });

  it("formats 443 minutes as '7h 23m' in currentDisplay", () => {
    const goal: GoalInput = {
      goalType: "sleep_minutes_daily",
      targetValue: 420,
      targetUnit: "minutes",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    // 443 > 420 so completed, but currentDisplay format is what we're testing
    const records: HealthRecordInput[] = [makeRecord(443, TODAY_STR, "sleep_minutes", "minutes")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.currentDisplay).toBe("7h 23m");
  });

  it("returns status completed when sleep minutes >= targetValue", () => {
    const goal: GoalInput = {
      goalType: "sleep_minutes_daily",
      targetValue: 420,
      targetUnit: "minutes",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(443, TODAY_STR, "sleep_minutes", "minutes")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("completed");
  });

  it("includes 'minutes' in weekOverWeekChange when improvement exists", () => {
    const goal: GoalInput = {
      goalType: "sleep_minutes_daily",
      targetValue: 480,
      targetUnit: "minutes",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    // Last week record falls in the previous 7-day window (14 days ago)
    const records: HealthRecordInput[] = [
      makeRecord(443, TODAY_STR, "sleep_minutes"),
      makeRecord(411, "2026-07-13", "sleep_minutes"), // 8 days ago, in last-week window
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    // 443 - 411 = 32 min improvement
    expect(result.weekOverWeekChange).toBe("Improved by 32 minutes this week");
  });
});

describe("GoalProgressCalculator — sleep_minutes_daily — missed", () => {
  it("returns status missed when no sleep records for today", () => {
    const goal: GoalInput = {
      goalType: "sleep_minutes_daily",
      targetValue: 420,
      targetUnit: "minutes",
      cadence: "daily",
      startDate: "2026-07-01",
    };

    const result = calculateGoalProgress(goal, [], TODAY);

    expect(result.status).toBe("missed");
  });
});

// ---------------------------------------------------------------------------
// weight_target
// ---------------------------------------------------------------------------

describe("GoalProgressCalculator — weight_target — at_risk", () => {
  it("returns status at_risk when weight loss is behind pace", () => {
    const goal: GoalInput = {
      goalType: "weight_target",
      targetValue: 162.7, // lose 15 lbs: from 177.7
      targetUnit: "lbs",
      cadence: "daily",
      startDate: "2026-07-14", // 1 week ago (7 of 30 days elapsed)
      endDate: "2026-08-14",   // 24 days remaining
    };
    // After 7/30 days, expected loss = 7/30*15 = 3.5 lbs. Actual = 177.7-175.4 = 2.3 lbs.
    // 2.3 < 3.5*0.85 = 2.975 → at_risk
    const records: HealthRecordInput[] = [
      makeRecord(177.7, "2026-07-14", "weight", "lbs"),
      makeRecord(175.4, TODAY_STR, "weight", "lbs"),
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("at_risk");
  });

  it("returns currentDisplay with weight in lbs", () => {
    const goal: GoalInput = {
      goalType: "weight_target",
      targetValue: 162.7,
      targetUnit: "lbs",
      cadence: "daily",
      startDate: "2026-07-14",
      endDate: "2026-08-14",
    };
    const records: HealthRecordInput[] = [
      makeRecord(177.7, "2026-07-14", "weight", "lbs"),
      makeRecord(175.4, TODAY_STR, "weight", "lbs"),
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.currentDisplay).toBe("175.4 lbs");
  });

  it("weekOverWeekChange mentions 'Behind pace' when weight increased this week vs last week", () => {
    const goal: GoalInput = {
      goalType: "weight_target",
      targetValue: 172.7,
      targetUnit: "lbs",
      cadence: "daily",
      startDate: "2026-07-01",
      endDate: "2026-08-01",
    };
    // Last week: 177.0, this week: 177.5 — weight went up, behind pace
    const records: HealthRecordInput[] = [
      makeRecord(177.0, "2026-07-13", "weight", "lbs"), // last-week window
      makeRecord(177.5, TODAY_STR, "weight", "lbs"),     // this-week window
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.weekOverWeekChange).toMatch(/Behind pace/);
  });

  it("returns status completed when current weight <= targetValue", () => {
    const goal: GoalInput = {
      goalType: "weight_target",
      targetValue: 175,
      targetUnit: "lbs",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(174.5, TODAY_STR, "weight", "lbs")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// active_minutes_weekly
// ---------------------------------------------------------------------------

describe("GoalProgressCalculator — active_minutes_weekly — on_track", () => {
  it("returns status on_track when weekly minutes are on pace for 150", () => {
    const goal: GoalInput = {
      goalType: "active_minutes_weekly",
      targetValue: 150,
      targetUnit: "minutes",
      cadence: "weekly",
      startDate: "2026-07-18", // started Saturday = 4 days elapsed in window (July 18-21)
    };
    // 127 min in 4 of 7 days — projected pace = 127/4*7 = 222, above 150 → on_track
    const records: HealthRecordInput[] = [
      makeRecord(30, "2026-07-18", "active_minutes"),
      makeRecord(35, "2026-07-19", "active_minutes"),
      makeRecord(32, "2026-07-20", "active_minutes"),
      makeRecord(30, "2026-07-21", "active_minutes"),
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("on_track");
  });

  it("returns currentValue equal to total active minutes this week (127)", () => {
    const goal: GoalInput = {
      goalType: "active_minutes_weekly",
      targetValue: 150,
      targetUnit: "minutes",
      cadence: "weekly",
      startDate: "2026-07-15",
    };
    const records: HealthRecordInput[] = [
      makeRecord(30, "2026-07-15", "active_minutes"),
      makeRecord(25, "2026-07-16", "active_minutes"),
      makeRecord(22, "2026-07-17", "active_minutes"),
      makeRecord(30, "2026-07-18", "active_minutes"),
      makeRecord(20, "2026-07-19", "active_minutes"),
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.currentValue).toBe(127);
  });

  it("weekOverWeekChange mentions days remaining when no last-week data", () => {
    const goal: GoalInput = {
      goalType: "active_minutes_weekly",
      targetValue: 150,
      targetUnit: "minutes",
      cadence: "weekly",
      startDate: "2026-07-15",
    };
    const records: HealthRecordInput[] = [
      makeRecord(40, "2026-07-19", "active_minutes"),
      makeRecord(40, "2026-07-20", "active_minutes"),
      makeRecord(47, "2026-07-21", "active_minutes"),
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.weekOverWeekChange).toMatch(/\d+ day[s]? remaining this week/);
  });

  it("returns status completed when weekly minutes >= 150", () => {
    const goal: GoalInput = {
      goalType: "active_minutes_weekly",
      targetValue: 150,
      targetUnit: "minutes",
      cadence: "weekly",
      startDate: "2026-07-15",
    };
    const records: HealthRecordInput[] = [
      makeRecord(60, "2026-07-15", "active_minutes"),
      makeRecord(50, "2026-07-17", "active_minutes"),
      makeRecord(50, "2026-07-19", "active_minutes"),
    ];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// archived
// ---------------------------------------------------------------------------

describe("GoalProgressCalculator — archived", () => {
  it("returns status archived when end_date is in the past", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-06-01",
      endDate: "2026-07-01", // past
    };
    const records: HealthRecordInput[] = [makeRecord(9000, "2026-06-30", "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("archived");
  });

  it("returns status archived regardless of currentValue when end_date has passed", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-06-01",
      endDate: "2026-07-10", // past
    };
    const records: HealthRecordInput[] = [makeRecord(15000, "2026-07-09", "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.status).toBe("archived");
  });

  it("returns weekOverWeekChange 'Goal period has ended' when archived", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-06-01",
      endDate: "2026-07-01",
    };

    const result = calculateGoalProgress(goal, [], TODAY);

    expect(result.weekOverWeekChange).toBe("Goal period has ended");
  });
});

// ---------------------------------------------------------------------------
// progressPercent bounds
// ---------------------------------------------------------------------------

describe("GoalProgressCalculator — progressPercent clamped to 0-100", () => {
  it("does not exceed 100 when currentValue is far above target", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };
    const records: HealthRecordInput[] = [makeRecord(25000, TODAY_STR, "steps")];

    const result = calculateGoalProgress(goal, records, TODAY);

    expect(result.progressPercent).toBe(100);
  });

  it("returns 0 progressPercent when no records exist", () => {
    const goal: GoalInput = {
      goalType: "steps_daily",
      targetValue: 10000,
      targetUnit: "steps",
      cadence: "daily",
      startDate: "2026-07-01",
    };

    const result = calculateGoalProgress(goal, [], TODAY);

    expect(result.progressPercent).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildGreeting,
  heartRateBadge,
  stepsBadge,
  bloodPressureBadge,
  sleepBadge,
  buildSummaryCards,
  buildLastSyncStatus,
  type HealthMetrics,
} from "./dashboardHelpers.js";

// ---------------------------------------------------------------------------
// buildGreeting
// ---------------------------------------------------------------------------

describe("buildGreeting — morning band (0–11)", () => {
  it("returns 'Good morning' for hour 0", () => {
    expect(buildGreeting("Michael Jordan", 0)).toBe("Good morning, Michael!");
  });

  it("returns 'Good morning' for hour 11", () => {
    expect(buildGreeting("Sarah Chen", 11)).toBe("Good morning, Sarah!");
  });

  it("uses first name only when fullName has multiple words", () => {
    expect(buildGreeting("Jane Doe Smith", 6)).toBe("Good morning, Jane!");
  });
});

describe("buildGreeting — afternoon band (12–17)", () => {
  it("returns 'Good afternoon' for hour 12", () => {
    expect(buildGreeting("Michael Jordan", 12)).toBe("Good afternoon, Michael!");
  });

  it("returns 'Good afternoon' for hour 17", () => {
    expect(buildGreeting("Alice", 17)).toBe("Good afternoon, Alice!");
  });
});

describe("buildGreeting — evening band (18–23)", () => {
  it("returns 'Good evening' for hour 18", () => {
    expect(buildGreeting("Michael Jordan", 18)).toBe("Good evening, Michael!");
  });

  it("returns 'Good evening' for hour 23", () => {
    expect(buildGreeting("Bob", 23)).toBe("Good evening, Bob!");
  });
});

// ---------------------------------------------------------------------------
// heartRateBadge
// ---------------------------------------------------------------------------

describe("heartRateBadge", () => {
  it("returns '✓ Normal' when bpm is 99", () => {
    expect(heartRateBadge(99)).toBe("✓ Normal");
  });

  it("returns '⚠️ Monitor' when bpm is exactly 100", () => {
    expect(heartRateBadge(100)).toBe("⚠️ Monitor");
  });

  it("returns '⚠️ Monitor' when bpm is 120", () => {
    expect(heartRateBadge(120)).toBe("⚠️ Monitor");
  });

  it("returns empty string when bpm is null", () => {
    expect(heartRateBadge(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// stepsBadge
// ---------------------------------------------------------------------------

describe("stepsBadge", () => {
  it("returns '↑ 78% of goal' for 7800 steps of 10000 goal", () => {
    expect(stepsBadge(7800, 10000)).toBe("↑ 78% of goal");
  });

  it("returns '↑ 100% of goal' when stepCount equals stepsGoal", () => {
    expect(stepsBadge(10000, 10000)).toBe("↑ 100% of goal");
  });

  it("rounds percentage correctly for 7842 / 10000", () => {
    expect(stepsBadge(7842, 10000)).toBe("↑ 78% of goal");
  });

  it("returns empty string when stepCount is null", () => {
    expect(stepsBadge(null, 10000)).toBe("");
  });

  it("returns empty string when stepsGoal is null", () => {
    expect(stepsBadge(8000, null)).toBe("");
  });

  it("returns empty string when stepsGoal is 0 (avoid division by zero)", () => {
    expect(stepsBadge(8000, 0)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// bloodPressureBadge
// ---------------------------------------------------------------------------

describe("bloodPressureBadge", () => {
  it("returns '✓ Normal' for 120/80", () => {
    expect(bloodPressureBadge(120, 80)).toBe("✓ Normal");
  });

  it("returns '⚠️ Elevated' when systolic is exactly 130", () => {
    expect(bloodPressureBadge(130, 80)).toBe("⚠️ Elevated");
  });

  it("returns '⚠️ Elevated' when diastolic is exactly 85", () => {
    expect(bloodPressureBadge(120, 85)).toBe("⚠️ Elevated");
  });

  it("returns '⚠️ Elevated' when both thresholds are exceeded", () => {
    expect(bloodPressureBadge(145, 92)).toBe("⚠️ Elevated");
  });

  it("returns '✓ Normal' for 129/84 (just below both thresholds)", () => {
    expect(bloodPressureBadge(129, 84)).toBe("✓ Normal");
  });

  it("returns empty string when systolic is null", () => {
    expect(bloodPressureBadge(null, 80)).toBe("");
  });

  it("returns empty string when diastolic is null", () => {
    expect(bloodPressureBadge(120, null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// sleepBadge
// ---------------------------------------------------------------------------

describe("sleepBadge", () => {
  it("returns 'Good' for 420 minutes (7h exactly) with quality 'good'", () => {
    expect(sleepBadge(420, "good")).toBe("Good");
  });

  it("returns 'Good' for 540 minutes (9h exactly) with quality 'good'", () => {
    expect(sleepBadge(540, "good")).toBe("Good");
  });

  it("returns '→ Fair' when hours are between 6 and 7 (360–420 mins)", () => {
    expect(sleepBadge(390, null)).toBe("→ Fair");
  });

  it("returns '→ Fair' when sleepQuality is 'fair' regardless of duration", () => {
    expect(sleepBadge(500, "fair")).toBe("→ Fair");
  });

  it("returns '⚠️ Poor' for 300 minutes (5h) with no quality", () => {
    expect(sleepBadge(300, null)).toBe("⚠️ Poor");
  });

  it("returns '⚠️ Poor' for 600 minutes (10h) exceeding range without quality 'good'", () => {
    expect(sleepBadge(600, null)).toBe("⚠️ Poor");
  });

  it("returns empty string when sleepMinutes is null", () => {
    expect(sleepBadge(null, "good")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildSummaryCards — device empty-state branches
// ---------------------------------------------------------------------------

const emptyMetrics: HealthMetrics = {
  heartRateBpm: null,
  stepCount: null,
  stepsGoal: null,
  systolicBp: null,
  diastolicBp: null,
  sleepMinutes: null,
  sleepQuality: null,
};

describe("buildSummaryCards — no devices connected", () => {
  it("all four cards have emptyState: true when no devices are present", () => {
    const cards = buildSummaryCards(emptyMetrics, { hasSmartwatch: false, hasSmartScale: false }, "default");
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.emptyState).toBe(true);
    }
  });
});

describe("buildSummaryCards — smartwatch only", () => {
  it("HeartRate, Steps, Sleep cards are populated; BloodPressure is emptyState", () => {
    const metrics: HealthMetrics = {
      heartRateBpm: 72,
      stepCount: 8000,
      stepsGoal: 10000,
      systolicBp: null,
      diastolicBp: null,
      sleepMinutes: 450,
      sleepQuality: "good",
    };
    const cards = buildSummaryCards(metrics, { hasSmartwatch: true, hasSmartScale: false }, "default");
    const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(byId["HeartRate"]?.emptyState).toBe(false);
    expect(byId["Steps"]?.emptyState).toBe(false);
    expect(byId["Sleep"]?.emptyState).toBe(false);
    expect(byId["BloodPressure"]?.emptyState).toBe(true);
  });
});

describe("buildSummaryCards — smart scale only", () => {
  it("BloodPressure card is populated; HeartRate, Steps, Sleep are emptyState", () => {
    const metrics: HealthMetrics = {
      heartRateBpm: null,
      stepCount: null,
      stepsGoal: null,
      systolicBp: 120,
      diastolicBp: 80,
      sleepMinutes: null,
      sleepQuality: null,
    };
    const cards = buildSummaryCards(metrics, { hasSmartwatch: false, hasSmartScale: true }, "default");
    const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(byId["BloodPressure"]?.emptyState).toBe(false);
    expect(byId["HeartRate"]?.emptyState).toBe(true);
    expect(byId["Steps"]?.emptyState).toBe(true);
    expect(byId["Sleep"]?.emptyState).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSummaryCards — persona ordering
// ---------------------------------------------------------------------------

describe("buildSummaryCards — persona ordering", () => {
  it("default mode orders: HeartRate, Steps, BloodPressure, Sleep", () => {
    const cards = buildSummaryCards(emptyMetrics, { hasSmartwatch: true, hasSmartScale: true }, "default");
    expect(cards.map((c) => c.id)).toEqual(["HeartRate", "Steps", "BloodPressure", "Sleep"]);
  });

  it("fitness mode orders: Steps, HeartRate, Sleep, BloodPressure", () => {
    const cards = buildSummaryCards(emptyMetrics, { hasSmartwatch: true, hasSmartScale: true }, "fitness");
    expect(cards.map((c) => c.id)).toEqual(["Steps", "HeartRate", "Sleep", "BloodPressure"]);
  });

  it("chronic_care_aware mode orders: HeartRate, BloodPressure, Sleep, Steps", () => {
    const cards = buildSummaryCards(emptyMetrics, { hasSmartwatch: true, hasSmartScale: true }, "chronic_care_aware");
    expect(cards.map((c) => c.id)).toEqual(["HeartRate", "BloodPressure", "Sleep", "Steps"]);
  });

  it("elder_friendly mode uses default ordering: HeartRate, Steps, BloodPressure, Sleep", () => {
    const cards = buildSummaryCards(emptyMetrics, { hasSmartwatch: true, hasSmartScale: true }, "elder_friendly");
    expect(cards.map((c) => c.id)).toEqual(["HeartRate", "Steps", "BloodPressure", "Sleep"]);
  });
});

// ---------------------------------------------------------------------------
// buildSummaryCards — badge values surfaced on cards
// ---------------------------------------------------------------------------

describe("buildSummaryCards — card badge values", () => {
  it("HeartRate card badge is '⚠️ Monitor' when heartRateBpm is 105", () => {
    const metrics: HealthMetrics = { ...emptyMetrics, heartRateBpm: 105 };
    const cards = buildSummaryCards(metrics, { hasSmartwatch: true, hasSmartScale: false }, "default");
    const hr = cards.find((c) => c.id === "HeartRate");
    expect(hr?.badge).toBe("⚠️ Monitor");
  });

  it("Steps card badge shows percentage of goal when both values present", () => {
    const metrics: HealthMetrics = { ...emptyMetrics, stepCount: 5000, stepsGoal: 10000 };
    const cards = buildSummaryCards(metrics, { hasSmartwatch: true, hasSmartScale: false }, "default");
    const steps = cards.find((c) => c.id === "Steps");
    expect(steps?.badge).toBe("↑ 50% of goal");
  });

  it("BloodPressure card value shows 'systolic/diastolic' format when both present", () => {
    const metrics: HealthMetrics = { ...emptyMetrics, systolicBp: 125, diastolicBp: 82 };
    const cards = buildSummaryCards(metrics, { hasSmartwatch: false, hasSmartScale: true }, "default");
    const bp = cards.find((c) => c.id === "BloodPressure");
    expect(bp?.value).toBe("125/82");
    expect(bp?.badge).toBe("✓ Normal");
  });
});

// ---------------------------------------------------------------------------
// buildLastSyncStatus
// ---------------------------------------------------------------------------

describe("buildLastSyncStatus", () => {
  it("returns 'No devices connected' label and null timestamp when devices array is empty", () => {
    const result = buildLastSyncStatus([]);
    expect(result.overallLastSyncAt).toBeNull();
    expect(result.stalenessLabel).toBe("No devices connected");
    expect(result.deviceStatuses).toHaveLength(0);
  });

  it("returns 'Up to date' label when no device is stale", () => {
    const result = buildLastSyncStatus([
      { deviceType: "smartwatch", connectionStatus: "connected", lastSyncAt: "2099-01-01T10:00:00Z", stale: false },
    ]);
    expect(result.stalenessLabel).toBe("Up to date");
    expect(result.overallLastSyncAt).toBe("2099-01-01T10:00:00Z");
  });

  it("returns 'Stale — sync recommended' label when any device is stale", () => {
    const result = buildLastSyncStatus([
      { deviceType: "smartwatch", connectionStatus: "connected", lastSyncAt: "2099-01-01T10:00:00Z", stale: false },
      { deviceType: "smart_scale", connectionStatus: "connected", lastSyncAt: "2099-01-01T08:00:00Z", stale: true },
    ]);
    expect(result.stalenessLabel).toBe("Stale — sync recommended");
  });

  it("picks the most recent lastSyncAt as overallLastSyncAt", () => {
    const result = buildLastSyncStatus([
      { deviceType: "smartwatch", connectionStatus: "connected", lastSyncAt: "2099-01-01T08:00:00Z", stale: false },
      { deviceType: "smart_scale", connectionStatus: "connected", lastSyncAt: "2099-01-01T10:00:00Z", stale: false },
    ]);
    expect(result.overallLastSyncAt).toBe("2099-01-01T10:00:00Z");
  });

  it("returns null overallLastSyncAt when all devices have null lastSyncAt", () => {
    const result = buildLastSyncStatus([
      { deviceType: "smartwatch", connectionStatus: "connected", lastSyncAt: null, stale: true },
    ]);
    expect(result.overallLastSyncAt).toBeNull();
    expect(result.stalenessLabel).toBe("Stale — sync recommended");
  });
});

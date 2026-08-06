// Pure business-rule helpers for the dashboard response.
// No database or HTTP dependencies — all functions are pure and testable in isolation.

export type PersonaMode = "default" | "fitness" | "elder_friendly" | "chronic_care_aware";

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------

export function buildGreeting(fullName: string, hourUtc: number): string {
  let salutation: string;
  if (hourUtc >= 0 && hourUtc < 12) {
    salutation = "Good morning";
  } else if (hourUtc < 18) {
    salutation = "Good afternoon";
  } else {
    salutation = "Good evening";
  }
  const firstName = fullName.split(" ")[0] ?? fullName;
  return `${salutation}, ${firstName}!`;
}

// ---------------------------------------------------------------------------
// Badge calculators
// ---------------------------------------------------------------------------

export function heartRateBadge(bpm: number | null): string {
  if (bpm === null) return "";
  return bpm >= 100 ? "⚠️ Monitor" : "✓ Normal";
}

export function stepsBadge(stepCount: number | null, stepsGoal: number | null): string {
  if (stepCount === null || stepsGoal === null || stepsGoal <= 0) return "";
  const pct = Math.round((stepCount / stepsGoal) * 100);
  return `↑ ${pct}% of goal`;
}

export function bloodPressureBadge(
  systolic: number | null,
  diastolic: number | null,
): string {
  if (systolic === null || diastolic === null) return "";
  return systolic >= 130 || diastolic >= 85 ? "⚠️ Elevated" : "✓ Normal";
}

export function sleepBadge(sleepMinutes: number | null, sleepQuality: string | null): string {
  if (sleepMinutes === null) return "";
  const hours = sleepMinutes / 60;
  if (hours >= 7 && hours <= 9 && sleepQuality === "good") return "Good";
  if ((hours >= 6 && hours < 7) || sleepQuality === "fair") return "→ Fair";
  return "⚠️ Poor";
}

// ---------------------------------------------------------------------------
// Summary card types
// ---------------------------------------------------------------------------

export type CardId = "HeartRate" | "Steps" | "BloodPressure" | "Sleep";

export interface SummaryCard {
  id: CardId;
  label: string;
  value: number | string | null;
  unit: string;
  badge: string;
  emptyState: boolean;
}

export interface HealthMetrics {
  heartRateBpm: number | null;
  stepCount: number | null;
  stepsGoal: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  sleepMinutes: number | null;
  sleepQuality: string | null;
}

export interface DevicePresence {
  hasSmartwatch: boolean;
  hasSmartScale: boolean;
}

// ---------------------------------------------------------------------------
// Card builder
// ---------------------------------------------------------------------------

function buildHeartRateCard(metrics: HealthMetrics, hasSmartwatch: boolean): SummaryCard {
  if (!hasSmartwatch) {
    return { id: "HeartRate", label: "Resting Heart Rate", value: null, unit: "bpm", badge: "", emptyState: true };
  }
  return {
    id: "HeartRate",
    label: "Resting Heart Rate",
    value: metrics.heartRateBpm,
    unit: "bpm",
    badge: heartRateBadge(metrics.heartRateBpm),
    emptyState: false,
  };
}

function buildStepsCard(metrics: HealthMetrics, hasSmartwatch: boolean): SummaryCard {
  if (!hasSmartwatch) {
    return { id: "Steps", label: "Steps", value: null, unit: "steps", badge: "", emptyState: true };
  }
  return {
    id: "Steps",
    label: "Steps",
    value: metrics.stepCount,
    unit: "steps",
    badge: stepsBadge(metrics.stepCount, metrics.stepsGoal),
    emptyState: false,
  };
}

function buildBloodPressureCard(metrics: HealthMetrics, hasSmartScale: boolean): SummaryCard {
  if (!hasSmartScale) {
    return { id: "BloodPressure", label: "Blood Pressure", value: null, unit: "mmHg", badge: "", emptyState: true };
  }
  const displayValue =
    metrics.systolicBp !== null && metrics.diastolicBp !== null
      ? `${metrics.systolicBp}/${metrics.diastolicBp}`
      : null;
  return {
    id: "BloodPressure",
    label: "Blood Pressure",
    value: displayValue,
    unit: "mmHg",
    badge: bloodPressureBadge(metrics.systolicBp, metrics.diastolicBp),
    emptyState: false,
  };
}

function buildSleepCard(metrics: HealthMetrics, hasSmartwatch: boolean): SummaryCard {
  if (!hasSmartwatch) {
    return { id: "Sleep", label: "Sleep", value: null, unit: "minutes", badge: "", emptyState: true };
  }
  return {
    id: "Sleep",
    label: "Sleep",
    value: metrics.sleepMinutes,
    unit: "minutes",
    badge: sleepBadge(metrics.sleepMinutes, metrics.sleepQuality),
    emptyState: false,
  };
}

// ---------------------------------------------------------------------------
// Persona ordering
// ---------------------------------------------------------------------------

export function buildSummaryCards(
  metrics: HealthMetrics,
  devices: DevicePresence,
  personaMode: PersonaMode,
): SummaryCard[] {
  const { hasSmartwatch, hasSmartScale } = devices;

  const heartRate = buildHeartRateCard(metrics, hasSmartwatch);
  const steps = buildStepsCard(metrics, hasSmartwatch);
  const bloodPressure = buildBloodPressureCard(metrics, hasSmartScale);
  const sleep = buildSleepCard(metrics, hasSmartwatch);

  // Persona ordering per spec:
  // fitness → [Steps, HeartRate, Sleep, BloodPressure]
  // chronic → [HeartRate, BloodPressure, Sleep, Steps]
  // default/elder_friendly/other → [HeartRate, Steps, BloodPressure, Sleep]
  if (personaMode === "fitness") {
    return [steps, heartRate, sleep, bloodPressure];
  }
  if (personaMode === "chronic_care_aware") {
    return [heartRate, bloodPressure, sleep, steps];
  }
  return [heartRate, steps, bloodPressure, sleep];
}

// ---------------------------------------------------------------------------
// Last sync status
// ---------------------------------------------------------------------------

export interface DeviceSyncStatus {
  deviceType: string;
  status: string;
  lastSyncAt: string | null;
  stale: boolean;
}

export interface LastSyncStatus {
  overallLastSyncAt: string | null;
  isStale: boolean;
  staleThresholdHours: number;
  stalenessLabel: string;
  deviceStatuses: DeviceSyncStatus[];
}

export function buildLastSyncStatus(
  devices: DeviceSyncStatus[],
  staleThresholdHours: number = 18,
): LastSyncStatus {
  if (devices.length === 0) {
    return {
      overallLastSyncAt: null,
      isStale: false,
      staleThresholdHours,
      stalenessLabel: "No devices connected",
      deviceStatuses: [],
    };
  }

  const timestamps = devices
    .map((d) => d.lastSyncAt)
    .filter((t): t is string => t !== null);

  const overallLastSyncAt =
    timestamps.length > 0
      ? timestamps.reduce((a, b) => (a > b ? a : b))
      : null;

  const isStale = devices.some((d) => d.stale);
  const stalenessLabel = isStale ? "Stale — sync recommended" : "Up to date";

  return { overallLastSyncAt, isStale, staleThresholdHours, stalenessLabel, deviceStatuses: devices };
}

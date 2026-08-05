export interface AlertThresholdConfig {
  staleAfterHours: { smartwatch: number; smart_scale: number };
  goalRiskThreshold: number;
  abnormalReadingThresholds: Record<string, { min?: number; max?: number }>;
}

export function loadAlertThresholdConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): AlertThresholdConfig {
  const smartwatch = env["ALERT_STALE_SMARTWATCH_HOURS"]
    ? Number(env["ALERT_STALE_SMARTWATCH_HOURS"])
    : 18;
  const smart_scale = env["ALERT_STALE_SMART_SCALE_HOURS"]
    ? Number(env["ALERT_STALE_SMART_SCALE_HOURS"])
    : 18;
  const goalRiskThreshold = env["ALERT_GOAL_RISK_THRESHOLD"]
    ? Number(env["ALERT_GOAL_RISK_THRESHOLD"])
    : 0.75;

  let abnormalReadingThresholds: Record<string, { min?: number; max?: number }> = {};
  const raw = env["ALERT_ABNORMAL_THRESHOLDS_JSON"];
  if (raw) {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      abnormalReadingThresholds = parsed as Record<string, { min?: number; max?: number }>;
    }
  }

  return { staleAfterHours: { smartwatch, smart_scale }, goalRiskThreshold, abnormalReadingThresholds };
}

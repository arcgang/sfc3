import type Database from "better-sqlite3";
import { loadAlertThresholdConfig } from "./alertConfig.js";
import { assignAlertPriority } from "./alertPriorityMatrix.js";
import type { AlertRuleResults } from "./alertPriorityMatrix.js";
import type { AlertCategory, AlertPriority } from "../repositories/AlertDao.js";

interface DeviceConnectionRow {
  id: string;
  device_type: string;
  last_successful_sync_at: string | null;
}

interface SyncRunRow {
  sync_status: string;
}

interface GoalRow {
  id: string;
  goal_type: string;
  target_value: number;
  start_date: string;
  end_date: string | null;
}

interface HealthRecordRow {
  id: string;
  value: number;
}

interface PreparedAlert {
  category: AlertCategory;
  message: string;
  entityId: string;
  entityType: string;
}

const GOAL_METRIC_MAP: Record<string, string> = {
  steps_daily: "steps",
  sleep_minutes_daily: "sleep_minutes",
  weight_target: "weight_kg",
  active_minutes_weekly: "active_minutes",
};

function msToHours(ms: number): number {
  return ms / (1000 * 60 * 60);
}

function msToDays(ms: number): number {
  return ms / (1000 * 60 * 60 * 24);
}

export async function evaluateAndPersist(
  userId: string,
  db: Database.Database,
): Promise<number> {
  const config = loadAlertThresholdConfig();

  const preparedAlerts: PreparedAlert[] = [];
  const ruleResults: AlertRuleResults = {
    staleDeviceCount: 0,
    totalDeviceCount: 0,
    hasAbnormalReading: false,
    hasSyncFailure: false,
    hasGoalRisk: false,
    hasInformationalSyncLag: false,
  };

  const now = new Date();

  // ── stale_data + sync_failure rules ────────────────────────────────────────
  const devices = db
    .prepare(
      "SELECT id, device_type, last_successful_sync_at FROM device_connections WHERE user_id = ?",
    )
    .all(userId) as DeviceConnectionRow[];

  ruleResults.totalDeviceCount = devices.length;

  for (const device of devices) {
    // stale_data
    const staleThresholdHours =
      config.staleAfterHours[device.device_type] ?? 18;

    const lastSync = device.last_successful_sync_at
      ? new Date(device.last_successful_sync_at)
      : null;

    const ageHours =
      lastSync === null
        ? Infinity
        : msToHours(now.getTime() - lastSync.getTime());

    if (ageHours > staleThresholdHours) {
      ruleResults.staleDeviceCount += 1;
      const deviceLabel =
        device.device_type === "smart_scale" ? "Smart scale" : "Smartwatch";
      preparedAlerts.push({
        category: "stale_data",
        message: `${deviceLabel} data has not synced in ${staleThresholdHours} hours.`,
        entityId: device.id,
        entityType: "device_connection",
      });
    }

    // sync_failure: latest sync_run for this device
    const latestRun = db
      .prepare(
        "SELECT sync_status FROM sync_runs WHERE device_connection_id = ? ORDER BY started_at DESC LIMIT 1",
      )
      .get(device.id) as SyncRunRow | undefined;

    if (latestRun?.sync_status === "failed") {
      ruleResults.hasSyncFailure = true;
      preparedAlerts.push({
        category: "sync_failure",
        message: `Device sync failed for ${device.device_type}.`,
        entityId: device.id,
        entityType: "device_connection",
      });
    }
  }

  // ── goal_risk rule ──────────────────────────────────────────────────────────
  const goals = db
    .prepare(
      "SELECT id, goal_type, target_value, start_date, end_date FROM goals WHERE user_id = ? AND status IN ('active','on_track','behind')",
    )
    .all(userId) as GoalRow[];

  for (const goal of goals) {
    const metricName = GOAL_METRIC_MAP[goal.goal_type];
    if (!metricName) continue;

    const startDate = new Date(goal.start_date);
    const endDate = goal.end_date
      ? new Date(goal.end_date)
      : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const daysSinceStart = Math.max(0, msToDays(now.getTime() - startDate.getTime()));
    const totalDays = Math.max(1, msToDays(endDate.getTime() - startDate.getTime()));

    const expectedProgress = goal.target_value * (daysSinceStart / totalDays);

    const latestRecord = db
      .prepare(
        "SELECT id, value FROM health_records WHERE user_id = ? AND metric_name = ? ORDER BY recorded_at DESC LIMIT 1",
      )
      .get(userId, metricName) as HealthRecordRow | undefined;

    const currentValue = latestRecord?.value ?? 0;

    if (currentValue < expectedProgress * config.goal_risk) {
      ruleResults.hasGoalRisk = true;
      preparedAlerts.push({
        category: "goal_risk",
        message: `Goal progress is behind target for ${goal.goal_type}.`,
        entityId: goal.id,
        entityType: "goal",
      });
    }
  }

  // ── abnormal_reading rule ───────────────────────────────────────────────────
  for (const [metricType, threshold] of Object.entries(
    config.abnormalReadingThresholds,
  )) {
    const latestRecord = db
      .prepare(
        "SELECT id, value FROM health_records WHERE user_id = ? AND metric_name = ? ORDER BY recorded_at DESC LIMIT 1",
      )
      .get(userId, metricType) as HealthRecordRow | undefined;

    if (!latestRecord) continue;

    const isAbnormal =
      (threshold.max !== undefined && latestRecord.value > threshold.max) ||
      (threshold.min !== undefined && latestRecord.value < threshold.min);

    if (isAbnormal) {
      ruleResults.hasAbnormalReading = true;
      preparedAlerts.push({
        category: "abnormal_reading",
        message: `Abnormal reading detected for ${metricType}.`,
        entityId: latestRecord.id,
        entityType: "health_record",
      });
    }
  }

  // ── priority assignment ─────────────────────────────────────────────────────
  const priority: AlertPriority = assignAlertPriority(ruleResults);

  // ── deduplication + persistence ─────────────────────────────────────────────
  let inserted = 0;

  const checkDupeStmt = db.prepare(
    "SELECT id FROM alerts WHERE user_id = ? AND category = ? AND entity_id = ? AND entity_type = ? AND acknowledged = 0",
  );

  const insertStmt = db.prepare(
    `INSERT INTO alerts (user_id, category, priority, message, entity_id, entity_type, acknowledged)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  );

  for (const alert of preparedAlerts) {
    const existing = checkDupeStmt.get(
      userId,
      alert.category,
      alert.entityId,
      alert.entityType,
    );

    if (existing) continue;

    insertStmt.run(
      userId,
      alert.category,
      priority,
      alert.message,
      alert.entityId,
      alert.entityType,
    );

    console.log(
      JSON.stringify({
        event: "alerts.generated",
        category: alert.category,
        priority,
        user_id: userId,
      }),
    );

    inserted += 1;
  }

  return inserted;
}

export async function acknowledgeAlert(
  alertId: number,
  userId: string,
  db: Database.Database,
): Promise<void> {
  const now = new Date().toISOString();

  const result = db
    .prepare(
      "UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ? AND user_id = ?",
    )
    .run(now, alertId, userId);

  if (result.changes === 0) {
    throw Object.assign(new Error("Alert not found"), {
      code: "RESOURCE_NOT_FOUND",
    });
  }

  console.log(
    JSON.stringify({
      event: "alerts.acknowledged",
      alert_id: alertId,
      user_id: userId,
    }),
  );
}

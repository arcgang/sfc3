import type Database from "better-sqlite3";
import type { DeviceType } from "./DeviceConnectionDao.js";

// ---------------------------------------------------------------------------
// Per-device status + latest metrics
// ---------------------------------------------------------------------------

export interface DeviceStatus {
  deviceType: DeviceType;
  connectionStatus: string;
  lastSuccessfulSyncAt: string | null;
  staleAfterHours: number;
  stale: boolean;
}

export interface SmartwatchMetrics {
  steps: number | null;
  heartRate: number | null;
  sleepMinutes: number | null;
  activeMinutes: number | null;
}

export interface SmartScaleMetrics {
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassPct: number | null;
}

export interface DashboardData {
  devices: DeviceStatus[];
  smartwatch: SmartwatchMetrics | null;
  smartScale: SmartScaleMetrics | null;
}

// ---------------------------------------------------------------------------
// Card metrics (names as stored by the sync pipeline)
// ---------------------------------------------------------------------------

export interface CardMetrics {
  heartRateBpm: number | null;
  stepCount: number | null;
  stepsGoal: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  sleepMinutes: number | null;
  sleepQuality: string | null;
}

// ---------------------------------------------------------------------------
// User profile summary
// ---------------------------------------------------------------------------

export interface UserProfileSummary {
  fullName: string;
  personaMode: string;
}

interface DeviceRow {
  device_type: string;
  connection_status: string;
  last_successful_sync_at: string | null;
  stale_after_hours: number;
}

interface MetricRow {
  metric_name: string;
  value: number;
}

interface StringMetricRow {
  metric_name: string;
  value: string;
}

export class DashboardDao {
  constructor(private readonly db: Database.Database) {}

  getForUser(userId: string): DashboardData {
    const deviceRows = this.db
      .prepare(
        `SELECT device_type, connection_status, last_successful_sync_at, stale_after_hours
           FROM device_connections
          WHERE user_id = ?
          ORDER BY device_type ASC`,
      )
      .all(userId) as DeviceRow[];

    const now = Date.now();
    const devices: DeviceStatus[] = deviceRows.map((row) => {
      const staleAfterHours = row.stale_after_hours;
      const threshold = new Date(now - staleAfterHours * 60 * 60 * 1000).toISOString();
      return {
        deviceType: row.device_type as DeviceType,
        connectionStatus: row.connection_status,
        lastSuccessfulSyncAt: row.last_successful_sync_at,
        staleAfterHours,
        stale:
          row.last_successful_sync_at === null ||
          row.last_successful_sync_at < threshold,
      };
    });

    const smartwatch = this.getLatestSmartwatchMetrics(userId);
    const smartScale = this.getLatestSmartScaleMetrics(userId);

    return { devices, smartwatch, smartScale };
  }

  private getLatestSmartwatchMetrics(userId: string): SmartwatchMetrics | null {
    // Fetch the most recent value per metric from the latest session
    const metricNames = ["steps", "heart_rate", "sleep_minutes", "active_minutes"];
    const metricMap = this.latestMetricValues(userId, "smartwatch", metricNames);

    if (metricMap.size === 0) return null;

    return {
      steps: metricMap.get("steps") ?? null,
      heartRate: metricMap.get("heart_rate") ?? null,
      sleepMinutes: metricMap.get("sleep_minutes") ?? null,
      activeMinutes: metricMap.get("active_minutes") ?? null,
    };
  }

  private getLatestSmartScaleMetrics(userId: string): SmartScaleMetrics | null {
    const metricNames = ["weight_kg", "body_fat_pct", "muscle_mass_pct"];
    const metricMap = this.latestMetricValues(userId, "smart_scale", metricNames);

    if (metricMap.size === 0) return null;

    return {
      weightKg: metricMap.get("weight_kg") ?? null,
      bodyFatPct: metricMap.get("body_fat_pct") ?? null,
      muscleMassPct: metricMap.get("muscle_mass_pct") ?? null,
    };
  }

  getCardMetrics(userId: string): CardMetrics {
    // Numeric metrics stored by SyncService for smartwatch
    const swMetricNames = ["heart_rate_bpm", "step_count", "steps_goal", "sleep_minutes"];
    const swMap = this.latestMetricValues(userId, "smartwatch", swMetricNames);

    // Numeric metrics from smart_scale (BP if available)
    const ssMetricNames = ["systolic_bp", "diastolic_bp"];
    const ssMap = this.latestMetricValues(userId, "smart_scale", ssMetricNames);

    // String metric: sleep_quality (stored as text by future syncs)
    const sleepQuality = this.latestStringMetricValue(userId, "smartwatch", "sleep_quality");

    return {
      heartRateBpm: swMap.get("heart_rate_bpm") ?? null,
      stepCount: swMap.get("step_count") ?? null,
      stepsGoal: swMap.get("steps_goal") ?? null,
      systolicBp: ssMap.get("systolic_bp") ?? null,
      diastolicBp: ssMap.get("diastolic_bp") ?? null,
      sleepMinutes: swMap.get("sleep_minutes") ?? null,
      sleepQuality,
    };
  }

  getUserProfile(userId: string): UserProfileSummary {
    const row = this.db
      .prepare(
        `SELECT u.full_name, COALESCE(p.persona_mode, 'default') AS persona_mode
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = ?`,
      )
      .get(userId) as { full_name: string; persona_mode: string } | undefined;

    return {
      fullName: row?.full_name ?? "",
      personaMode: row?.persona_mode ?? "default",
    };
  }

  private latestMetricValues(
    userId: string,
    sourceType: string,
    metricNames: string[],
  ): Map<string, number> {
    // For each metric name, get the value from the most recently recorded row.
    const placeholders = metricNames.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT metric_name, value
           FROM health_records
          WHERE user_id = ?
            AND source_type = ?
            AND metric_name IN (${placeholders})
            AND recorded_at = (
              SELECT MAX(hr2.recorded_at)
                FROM health_records hr2
               WHERE hr2.user_id = health_records.user_id
                 AND hr2.source_type = health_records.source_type
                 AND hr2.metric_name = health_records.metric_name
            )
          ORDER BY metric_name ASC`,
      )
      .all(userId, sourceType, ...metricNames) as MetricRow[];

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.metric_name, row.value);
    }
    return map;
  }

  private latestStringMetricValue(
    userId: string,
    sourceType: string,
    metricName: string,
  ): string | null {
    const row = this.db
      .prepare(
        `SELECT metric_name, value
           FROM health_records
          WHERE user_id = ?
            AND source_type = ?
            AND metric_name = ?
          ORDER BY recorded_at DESC
          LIMIT 1`,
      )
      .get(userId, sourceType, metricName) as StringMetricRow | undefined;

    return row ? String(row.value) : null;
  }
}

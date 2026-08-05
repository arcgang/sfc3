import type Database from "better-sqlite3";
import type { DeviceType } from "./DeviceConnectionDao.js";

// ---------------------------------------------------------------------------
// Per-device status + latest metrics
// ---------------------------------------------------------------------------

export interface DeviceStatus {
  deviceType: DeviceType;
  connectionStatus: string;
  lastSuccessfulSyncAt: string | null;
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

const STALE_HOURS = 12;

interface DeviceRow {
  device_type: string;
  connection_status: string;
  last_successful_sync_at: string | null;
}

interface MetricRow {
  metric_name: string;
  value: number;
}

export class DashboardDao {
  constructor(private readonly db: Database.Database) {}

  getForUser(userId: string): DashboardData {
    const deviceRows = this.db
      .prepare(
        `SELECT device_type, connection_status, last_successful_sync_at
           FROM device_connections
          WHERE user_id = ?
          ORDER BY device_type ASC`,
      )
      .all(userId) as DeviceRow[];

    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    const devices: DeviceStatus[] = deviceRows.map((row) => ({
      deviceType: row.device_type as DeviceType,
      connectionStatus: row.connection_status,
      lastSuccessfulSyncAt: row.last_successful_sync_at,
      stale:
        row.last_successful_sync_at === null ||
        row.last_successful_sync_at < staleThreshold,
    }));

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
}

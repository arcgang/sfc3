import { Router, type Request, type Response } from "express";
import { getDatabase } from "../db/connection.js";
import type { ErrorResponse } from "../types/errors.js";

export interface DeviceRow {
  id: string;
  device_type: string;
  device_name: string;
  connection_status: string;
  last_successful_sync_at: string | null;
  stale_after_hours: number;
  battery_level: string | null;
}

export interface DeviceSyncResult {
  id: string;
  name: string;
  type: string;
  lastSyncAt: string | null;
  staleAfterHours: number;
  isStale: boolean;
  syncStatus: string;
  batteryLevel: string | null;
}

export interface LastSyncStatus {
  isStale: boolean;
  overallLastSyncAt: string | null;
  staleThresholdHours: number;
}

export interface DashboardRefreshPayload {
  lastSyncStatus: LastSyncStatus;
  devices: DeviceSyncResult[];
}

/** Pure: compute isStale for a device given the current epoch ms. */
export function computeIsStale(
  lastSuccessfulSyncAt: string | null,
  staleAfterHours: number,
  nowMs: number,
): boolean {
  if (lastSuccessfulSyncAt === null) return true;
  const syncEpochMs = new Date(lastSuccessfulSyncAt).getTime();
  return nowMs - syncEpochMs > staleAfterHours * 3600 * 1000;
}

/**
 * Mock refresh attempt: log sync_started then sync_failed.
 * Does NOT modify health_records or last_successful_sync_at.
 * Returns "failed" to signal the stale badge should remain.
 */
export function attemptMockRefresh(
  deviceId: string,
  deviceType: string,
  correlationId: string,
): "failed" {
  console.log(
    JSON.stringify({
      event: "device.sync_started",
      deviceId,
      deviceType,
      correlationId,
    }),
  );
  console.log(
    JSON.stringify({
      event: "device.sync_failed",
      deviceId,
      deviceType,
      correlationId,
      error: "mock_refresh_unavailable",
    }),
  );
  return "failed";
}

/** Build the full payload from raw device rows, triggering mock refresh for stale devices. */
export function buildDashboardPayload(
  rows: DeviceRow[],
  nowMs: number,
  correlationId: string,
): DashboardRefreshPayload {
  const devices: DeviceSyncResult[] = rows.map((row) => {
    const isStale = computeIsStale(row.last_successful_sync_at, row.stale_after_hours, nowMs);
    let syncStatus = row.connection_status;
    if (isStale) {
      syncStatus = attemptMockRefresh(row.id, row.device_type, correlationId);
    }
    return {
      id: row.id,
      name: row.device_name,
      type: row.device_type,
      lastSyncAt: row.last_successful_sync_at,
      staleAfterHours: row.stale_after_hours,
      isStale,
      syncStatus,
      batteryLevel: row.battery_level,
    };
  });

  const isStale = devices.some((d) => d.isStale);

  const syncTimestamps = devices
    .map((d) => d.lastSyncAt)
    .filter((t): t is string => t !== null);
  const overallLastSyncAt =
    syncTimestamps.length > 0
      ? syncTimestamps.reduce((a, b) => (a > b ? a : b))
      : null;

  const staleThresholdHours =
    rows.length > 0
      ? Math.min(...rows.map((r) => r.stale_after_hours))
      : 18;

  return {
    lastSyncStatus: { isStale, overallLastSyncAt, staleThresholdHours },
    devices,
  };
}

export const dashboardRefreshRouter = Router();

dashboardRefreshRouter.get("/", (req: Request, res: Response): void => {
  const correlationId =
    typeof res.locals["correlationId"] === "string" ? res.locals["correlationId"] : "";

  const rawUser = res.locals["user"];
  if (
    typeof rawUser !== "object" ||
    rawUser === null ||
    typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
  ) {
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: { type: "AUTH_TOKEN_INVALID", details: [] },
    };
    res.status(401).json(body);
    return;
  }
  const userId = (rawUser as { sub: string }).sub;

  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, device_type, device_name, connection_status,
              last_successful_sync_at, stale_after_hours, battery_level
         FROM device_connections
        WHERE user_id = ?
        ORDER BY device_type ASC`,
    )
    .all(userId) as DeviceRow[];

  const payload = buildDashboardPayload(rows, Date.now(), correlationId);
  res.status(200).json(payload);
});

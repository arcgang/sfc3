import { Router, type Request, type Response } from "express";
import { getDatabase } from "../db/connection.js";
import { DashboardDao } from "../repositories/DashboardDao.js";
import type { ErrorResponse } from "../types/errors.js";
import {
  buildGreeting,
  buildSummaryCards,
  buildLastSyncStatus,
  type PersonaMode,
  type DevicePresence,
  type DeviceSyncStatus,
  type HealthMetrics,
} from "../dashboard/dashboardHelpers.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", (req: Request, res: Response): void => {
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
  const dao = new DashboardDao(db);

  // Core raw data
  const data = dao.getForUser(userId);
  const profile = dao.getUserProfile(userId);
  const cardMetrics = dao.getCardMetrics(userId);
  const trends = dao.getTrendsForUser(userId);

  // Greeting derived from server wall-clock hour (UTC)
  const hourUtc = new Date().getUTCHours();
  const greeting = buildGreeting(profile.fullName || "there", hourUtc);

  // Device presence for empty-state rules
  const hasSmartwatch = data.devices.some((d) => d.deviceType === "smartwatch");
  const hasSmartScale = data.devices.some((d) => d.deviceType === "smart_scale");
  const devices: DevicePresence = { hasSmartwatch, hasSmartScale };

  const metrics: HealthMetrics = {
    heartRateBpm: cardMetrics.heartRateBpm,
    stepCount: cardMetrics.stepCount,
    stepsGoal: cardMetrics.stepsGoal,
    systolicBp: cardMetrics.systolicBp,
    diastolicBp: cardMetrics.diastolicBp,
    sleepMinutes: cardMetrics.sleepMinutes,
    sleepQuality: cardMetrics.sleepQuality,
  };

  const personaMode = (profile.personaMode as PersonaMode) ?? "default";
  const summaryCards = buildSummaryCards(metrics, devices, personaMode);

  // Last sync status derived from device rows.
  // staleThresholdHours for the overall payload uses the minimum (strictest) threshold
  // across all connected devices, or the LLD default of 18h when none are present.
  const DEFAULT_STALE_THRESHOLD = 18;
  const staleThresholdHours =
    data.devices.length > 0
      ? Math.min(...data.devices.map((d) => d.staleAfterHours))
      : DEFAULT_STALE_THRESHOLD;

  const deviceSyncStatuses: DeviceSyncStatus[] = data.devices.map((d) => ({
    deviceType: d.deviceType,
    status: d.connectionStatus,
    lastSyncAt: d.lastSuccessfulSyncAt,
    stale: d.stale,
  }));
  const lastSyncStatus = buildLastSyncStatus(deviceSyncStatuses, staleThresholdHours);

  res.setHeader("X-Correlation-Id", correlationId);
  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: {
      greeting,
      personaMode,
      summaryCards,
      lastSyncStatus,
      trends,
      // Legacy raw device/metric fields preserved for existing consumers
      devices: data.devices,
      smartwatch: data.smartwatch,
      smartScale: data.smartScale,
    },
  });
});

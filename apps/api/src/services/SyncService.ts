import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { DeviceType } from "../repositories/DeviceConnectionDao.js";
import { DeviceConnectionDao } from "../repositories/DeviceConnectionDao.js";
import { SyncRunDao } from "../repositories/SyncRunDao.js";
import { HealthRecordDao, type HealthRecordInsert } from "../repositories/HealthRecordDao.js";

// ---------------------------------------------------------------------------
// Provider payload shapes
// ---------------------------------------------------------------------------

export interface SmartwatchSession {
  sessionId: string;
  recordedAt: string;
  heartRateBpm: number;
  stepCount: number;
  activeMinutes: number;
  sleepMinutes?: number;
}

export interface SmartScaleSession {
  sessionId: string;
  recordedAt: string;
  weightKg: number;
  bodyFatPct?: number;
  muscleMassPct?: number;
  boneMassKg?: number;
}

export type ProviderPayload =
  | { deviceType: "smartwatch"; sessions: SmartwatchSession[] }
  | { deviceType: "smart_scale"; sessions: SmartScaleSession[] };

// ---------------------------------------------------------------------------
// Provider stub interface
// ---------------------------------------------------------------------------

export interface ProviderClient {
  fetchData(deviceConnectionId: string, syncWindowHours: number): Promise<ProviderPayload>;
}

// ---------------------------------------------------------------------------
// Provider stubs (deterministic test-compatible implementations)
// ---------------------------------------------------------------------------

class SmartwatchProviderClient implements ProviderClient {
  async fetchData(
    deviceConnectionId: string,
    syncWindowHours: number,
  ): Promise<ProviderPayload> {
    return {
      deviceType: "smartwatch",
      sessions: [
        {
          sessionId: `sw-session-${deviceConnectionId}-${syncWindowHours}`,
          recordedAt: new Date(Date.now() - 3_600_000).toISOString(),
          heartRateBpm: 72,
          stepCount: 8234,
          activeMinutes: 45,
          sleepMinutes: 420,
        },
      ],
    };
  }
}

class SmartScaleProviderClient implements ProviderClient {
  async fetchData(
    deviceConnectionId: string,
    syncWindowHours: number,
  ): Promise<ProviderPayload> {
    return {
      deviceType: "smart_scale",
      sessions: [
        {
          sessionId: `scale-session-${deviceConnectionId}-${syncWindowHours}`,
          recordedAt: new Date(Date.now() - 3_600_000).toISOString(),
          weightKg: 75.2,
          bodyFatPct: 18.5,
          muscleMassPct: 42.1,
          boneMassKg: 3.2,
        },
      ],
    };
  }
}

export function getProviderClient(deviceType: DeviceType): ProviderClient {
  if (deviceType === "smart_scale") return new SmartScaleProviderClient();
  return new SmartwatchProviderClient();
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function normalizeSmartwatch(
  session: SmartwatchSession,
  userId: string,
  deviceConnectionId: string,
): HealthRecordInsert[] {
  const hash = sha256(JSON.stringify(session));
  const base = {
    userId,
    deviceConnectionId,
    sourceType: "smartwatch" as const,
    measurementSessionId: session.sessionId,
    sourcePayloadHash: hash,
    recordedAt: session.recordedAt,
  };

  const records: HealthRecordInsert[] = [
    {
      ...base,
      metricDomain: "vitals",
      metricName: "heart_rate_bpm",
      value: session.heartRateBpm,
      unit: "bpm",
    },
    {
      ...base,
      metricDomain: "activity",
      metricName: "step_count",
      value: session.stepCount,
      unit: "steps",
    },
    {
      ...base,
      metricDomain: "activity",
      metricName: "active_minutes",
      value: session.activeMinutes,
      unit: "minutes",
    },
  ];

  if (session.sleepMinutes !== undefined) {
    records.push({
      ...base,
      metricDomain: "sleep",
      metricName: "sleep_minutes",
      value: session.sleepMinutes,
      unit: "minutes",
    });
  }

  return records;
}

// Required body-composition fields for smart_scale sessions.
// A session missing any of these is discarded per acceptance criteria.
const REQUIRED_BODY_COMP_FIELDS: ReadonlyArray<keyof SmartScaleSession> = [
  "bodyFatPct",
  "muscleMassPct",
  "boneMassKg",
];

function isCompleteScaleSession(session: SmartScaleSession): session is CompleteSmartScaleSession {
  return REQUIRED_BODY_COMP_FIELDS.every(
    (field) => session[field] !== undefined && session[field] !== null,
  );
}

interface CompleteSmartScaleSession extends SmartScaleSession {
  bodyFatPct: number;
  muscleMassPct: number;
  boneMassKg: number;
}

function normalizeSmartScale(
  session: CompleteSmartScaleSession,
  userId: string,
  deviceConnectionId: string,
): HealthRecordInsert[] {
  const hash = sha256(JSON.stringify(session));
  const base = {
    userId,
    deviceConnectionId,
    sourceType: "smart_scale" as const,
    measurementSessionId: session.sessionId,
    sourcePayloadHash: hash,
    recordedAt: session.recordedAt,
  };

  return [
    {
      ...base,
      metricDomain: "body_composition",
      metricName: "weight_kg",
      value: session.weightKg,
      unit: "kg",
    },
    {
      ...base,
      metricDomain: "body_composition",
      metricName: "body_fat_pct",
      value: session.bodyFatPct,
      unit: "%",
    },
    {
      ...base,
      metricDomain: "body_composition",
      metricName: "muscle_mass_pct",
      value: session.muscleMassPct,
      unit: "%",
    },
    {
      ...base,
      metricDomain: "body_composition",
      metricName: "bone_mass_kg",
      value: session.boneMassKg,
      unit: "kg",
    },
  ];
}

// ---------------------------------------------------------------------------
// Sync result
// ---------------------------------------------------------------------------

export interface SyncResult {
  syncRunId: string;
  syncStatus: "succeeded" | "failed" | "partial_discard";
  recordsWritten: number;
  recordsDiscarded: number;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// SyncService
// ---------------------------------------------------------------------------

export class SyncService {
  private readonly deviceDao: DeviceConnectionDao;
  private readonly syncRunDao: SyncRunDao;
  private readonly healthRecordDao: HealthRecordDao;

  constructor(
    db: Database.Database,
    private readonly providerClientFactory: (deviceType: DeviceType) => ProviderClient = getProviderClient,
  ) {
    this.deviceDao = new DeviceConnectionDao(db);
    this.syncRunDao = new SyncRunDao(db);
    this.healthRecordDao = new HealthRecordDao(db);
  }

  async sync(params: {
    deviceConnectionId: string;
    userId: string;
    deviceType: DeviceType;
    syncWindowHours: number;
    correlationId: string;
  }): Promise<SyncResult> {
    const { deviceConnectionId, userId, deviceType, syncWindowHours, correlationId } = params;

    const startedAt = new Date().toISOString();

    console.log({
      event: "device.sync_started",
      deviceConnectionId,
      userId,
      deviceType,
      correlationId,
    });

    const syncRun = this.syncRunDao.create(deviceConnectionId, startedAt);

    const client = this.providerClientFactory(deviceType);
    let payload: ProviderPayload;

    try {
      payload = await client.fetchData(deviceConnectionId, syncWindowHours);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Provider call failed";

      console.log({
        event: "device.sync_failed",
        deviceConnectionId,
        userId,
        deviceType,
        correlationId,
        errorMessage,
      });

      const finishedAt = new Date().toISOString();
      this.syncRunDao.finish(syncRun.id, {
        syncStatus: "failed",
        finishedAt,
        recordsWritten: 0,
        recordsDiscarded: 0,
        errorMessage,
      });

      return {
        syncRunId: syncRun.id,
        syncStatus: "failed",
        recordsWritten: 0,
        recordsDiscarded: 0,
        errorMessage,
      };
    }

    // Normalize payload and separate complete vs discarded sessions
    let allRecords: HealthRecordInsert[] = [];
    let discardedCount = 0;

    if (payload.deviceType === "smartwatch") {
      for (const session of payload.sessions) {
        allRecords.push(...normalizeSmartwatch(session, userId, deviceConnectionId));
      }
    } else {
      for (const session of payload.sessions) {
        if (isCompleteScaleSession(session)) {
          allRecords.push(...normalizeSmartScale(session, userId, deviceConnectionId));
        } else {
          discardedCount++;
        }
      }
    }

    // Write health records inside a transaction
    if (allRecords.length > 0) {
      this.healthRecordDao.insertMany(allRecords);
    }

    const finishedAt = new Date().toISOString();
    const syncStatus = discardedCount > 0 ? "partial_discard" : "succeeded";

    this.syncRunDao.finish(syncRun.id, {
      syncStatus,
      finishedAt,
      recordsWritten: allRecords.length,
      recordsDiscarded: discardedCount,
      errorMessage: null,
    });

    this.deviceDao.updateLastSuccessfulSyncAt(deviceConnectionId, finishedAt);

    return {
      syncRunId: syncRun.id,
      syncStatus,
      recordsWritten: allRecords.length,
      recordsDiscarded: discardedCount,
      errorMessage: null,
    };
  }
}

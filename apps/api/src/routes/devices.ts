import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type Database from "better-sqlite3";
import { getDatabase } from "../db/connection.js";
import { DeviceConnectionDao, type DeviceType } from "../repositories/DeviceConnectionDao.js";
import { SyncService, type SyncResult } from "../services/SyncService.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

interface SeedDevice {
  id: string;
  userId: string;
  deviceName: string;
  provider: string;
  deviceType: DeviceType;
  connectionStatus: "connected" | "disconnected" | "error" | "pending";
  lastSyncAtOffset: number;
  batteryLevel: string;
  connectedSince: string;
}

// Each seed device gets its own user because device_connections has UNIQUE(user_id, device_type)
// and two seed devices share the same deviceType ('smartwatch').
const SEED_DEVICES: SeedDevice[] = [
  {
    id: "seed-device-fitbit-charge-5",
    userId: "seed-user-fitbit",
    deviceName: "Fitbit Charge 5",
    provider: "Fitbit",
    deviceType: "smartwatch",
    connectionStatus: "connected",
    lastSyncAtOffset: -2 * 60 * 60 * 1000,
    batteryLevel: "78%",
    connectedSince: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "seed-device-withings-body-plus",
    userId: "seed-user-withings",
    deviceName: "Withings Body+",
    provider: "Withings",
    deviceType: "smart_scale",
    connectionStatus: "disconnected",
    lastSyncAtOffset: -18 * 60 * 60 * 1000,
    batteryLevel: "Good",
    connectedSince: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "seed-device-apple-watch-series-8",
    userId: "seed-user-apple",
    deviceName: "Apple Watch Series 8",
    provider: "Apple",
    deviceType: "smartwatch",
    connectionStatus: "error",
    lastSyncAtOffset: -3 * 24 * 60 * 60 * 1000,
    batteryLevel: "Unknown",
    connectedSince: "2025-12-20T00:00:00.000Z",
  },
];

function seedDevicesIfEmpty(db: Database.Database): void {
  const dao = new DeviceConnectionDao(db);
  const all = dao.findAll();
  if (all.length > 0) return;

  const now = new Date().toISOString();
  const baseTime = Date.now();

  for (const device of SEED_DEVICES) {
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE id = ?`)
      .get(device.userId) as { id: string } | undefined;

    if (!existingUser) {
      db.prepare(
        `INSERT INTO users (id, email, password_hash, account_status)
         VALUES (?, ?, ?, 'active')`,
      ).run(
        device.userId,
        `${device.userId}@seed.local`,
        "$2b$10$placeholder-hash-for-seed-user-only",
      );
    }

    const lastSyncAt = new Date(baseTime + device.lastSyncAtOffset).toISOString();
    dao.createWithTimestamps({
      id: device.id,
      userId: device.userId,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      provider: device.provider,
      connectionStatus: device.connectionStatus,
      lastSyncAt,
      lastSuccessfulSyncAt: device.connectionStatus === "connected" ? lastSyncAt : null,
      batteryLevel: device.batteryLevel,
      connectedSince: device.connectedSince,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export interface SyncServiceLike {
  sync(params: {
    deviceConnectionId: string;
    userId: string;
    deviceType: DeviceType;
    syncWindowHours: number;
    correlationId: string;
  }): Promise<SyncResult>;
}

const connectSchema = z.object({
  deviceType: z.enum(["smartwatch", "smart_scale"]),
  action: z.enum(["connect", "reconnect", "disconnect", "sync"]),
  provider: z.string().min(1).optional(),
  deviceName: z.string().optional(),
  providerAccountRef: z.string().nullable().optional(),
  syncWindowHours: z.number().int().min(1).max(168).optional(),
});

type ConnectBody = z.infer<typeof connectSchema>;
type TypedRequest = Request & { body: ConnectBody };

const syncBodySchema = z.object({
  syncWindowHours: z.number().int().min(1).max(168).optional(),
});

type SyncBody = z.infer<typeof syncBodySchema>;
type SyncRequest = Request & { params: { id: string }; body: SyncBody };

export function createDevicesRouter(
  syncServiceFactory?: (db: Database.Database) => SyncServiceLike,
): ReturnType<typeof Router> {
  const router = Router();

  const makeSyncService = syncServiceFactory ?? ((db) => new SyncService(db));

  router.put(
    "/connections",
    validateBody(connectSchema),
    (req: TypedRequest, res: Response): void => {
      const { deviceType, action, provider, deviceName } = req.body;
      const correlationId =
        typeof res.locals["correlationId"] === "string"
          ? res.locals["correlationId"]
          : "";

      const rawUser = res.locals["user"];
      if (
        typeof rawUser !== "object" ||
        rawUser === null ||
        typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
      ) {
        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "AUTH_TOKEN_INVALID",
            details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
          },
        };
        res.status(401).json(body);
        return;
      }
      const userId = (rawUser as { sub: string }).sub;

      const db = getDatabase();
      const store = new DeviceConnectionDao(db);

      if (action === "connect") {
        handleConnect(res, store, userId, deviceType, provider, deviceName, correlationId);
        return;
      }

      if (action === "reconnect") {
        handleReconnect(res, store, userId, deviceType, correlationId);
        return;
      }

      if (action === "disconnect") {
        handleDisconnect(res, store, userId, deviceType, correlationId);
        return;
      }

      // action === "sync"
      const existing = store.findByUserAndType(userId, deviceType);
      if (!existing) {
        sendConflict(res, correlationId, "Cannot sync: no connection record exists for this device.");
        return;
      }

      res.status(202).json({
        meta: { correlationId, timestamp: new Date().toISOString() },
        data: {
          device: toDeviceDto(existing),
          ingestion: null,
        },
      });
    },
  );

  router.post(
    "/:id/sync",
    validateBody(syncBodySchema),
    (req: SyncRequest, res: Response): void => {
      const { id: deviceConnectionId } = req.params;
      const syncWindowHours = req.body.syncWindowHours ?? 24;
      const correlationId =
        typeof res.locals["correlationId"] === "string"
          ? res.locals["correlationId"]
          : "";

      const rawUser = res.locals["user"];
      if (
        typeof rawUser !== "object" ||
        rawUser === null ||
        typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
      ) {
        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "AUTH_TOKEN_INVALID",
            details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
          },
        };
        res.status(401).json(body);
        return;
      }
      const userId = (rawUser as { sub: string }).sub;

      const db = getDatabase();
      const store = new DeviceConnectionDao(db);
      const connection = store.findById(deviceConnectionId);

      if (!connection) {
        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "NOT_FOUND",
            details: [{ code: "NOT_FOUND", message: "Device connection not found." }],
          },
        };
        res.status(404).json(body);
        return;
      }

      if (connection.userId !== userId) {
        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "FORBIDDEN",
            details: [{ code: "FORBIDDEN", message: "You do not have access to this device." }],
          },
        };
        res.status(403).json(body);
        return;
      }

      const syncService = makeSyncService(db);

      syncService
        .sync({
          deviceConnectionId,
          userId,
          deviceType: connection.deviceType,
          syncWindowHours,
          correlationId,
        })
        .then((result) => {
          if (result.syncStatus === "failed") {
            const body: ErrorResponse = {
              meta: { correlationId, timestamp: new Date().toISOString() },
              error: {
                type: "SYNC_FAILED",
                details: [
                  {
                    code: "SYNC_FAILED",
                    message:
                      result.errorMessage ??
                      "Sync failed. Please try again later.",
                  },
                ],
              },
            };
            res.status(502).json(body);
            return;
          }

          res.status(200).json({
            meta: { correlationId, timestamp: new Date().toISOString() },
            data: {
              syncRunId: result.syncRunId,
              syncStatus: result.syncStatus,
              recordsWritten: result.recordsWritten,
              recordsDiscarded: result.recordsDiscarded,
            },
          });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Unexpected error during sync.";
          console.error({ event: "device.sync_error", deviceConnectionId, correlationId, message });
          const body: ErrorResponse = {
            meta: { correlationId, timestamp: new Date().toISOString() },
            error: {
              type: "INTERNAL_ERROR",
              details: [{ code: "INTERNAL_ERROR", message }],
            },
          };
          res.status(500).json(body);
        });
    },
  );

  router.get(
    "/connections",
    (req: Request, res: Response): void => {
      const correlationId =
        typeof res.locals["correlationId"] === "string"
          ? res.locals["correlationId"]
          : "";

      const rawUser = res.locals["user"];
      if (
        typeof rawUser !== "object" ||
        rawUser === null ||
        typeof (rawUser as Record<string, unknown>)["sub"] !== "string"
      ) {
        const body: ErrorResponse = {
          meta: { correlationId, timestamp: new Date().toISOString() },
          error: {
            type: "AUTH_TOKEN_INVALID",
            details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }],
          },
        };
        res.status(401).json(body);
        return;
      }
      const userId = (rawUser as { sub: string }).sub;

      const db = getDatabase();
      const store = new DeviceConnectionDao(db);
      const connections = store.findAllByUser(userId);

      res.status(200).json({
        meta: { correlationId, timestamp: new Date().toISOString() },
        data: {
          devices: connections.map(toDeviceDto),
        },
      });
    },
  );

  // GET / — returns all device rows (MVP: no auth required)
  // intentionally public: returns all devices for the MVP dashboard
  router.get("/", (req: Request, res: Response): void => {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const db = getDatabase();
    seedDevicesIfEmpty(db);
    const store = new DeviceConnectionDao(db);
    const devices = store.findAll();

    res.status(200).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: { devices: devices.map(toDeviceDto) },
    });
  });

  // POST /:id/reconnect — set status to connected and refresh last_sync_at
  router.post("/:id/reconnect", (req: Request, res: Response): void => {
    const { id } = req.params as { id: string };
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const db = getDatabase();
    const store = new DeviceConnectionDao(db);
    const connection = store.findById(id);

    if (!connection) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "NOT_FOUND",
          details: [{ code: "NOT_FOUND", message: "Device connection not found." }],
        },
      };
      res.status(404).json(body);
      return;
    }

    store.updateSyncNow(id);
    const updated = store.findById(id);
    if (!updated) {
      throw new Error(`device_connections row not found after reconnect for id=${id}`);
    }

    console.log({
      event: "device.reconnected",
      deviceId: id,
      deviceType: updated.deviceType,
      correlationId,
    });

    res.status(200).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: { device: toDeviceDto(updated) },
    });
  });

  // DELETE /:id — remove device row
  router.delete("/:id", (req: Request, res: Response): void => {
    const { id } = req.params as { id: string };
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";

    const db = getDatabase();
    const store = new DeviceConnectionDao(db);
    const deleted = store.deleteById(id);

    if (!deleted) {
      const body: ErrorResponse = {
        meta: { correlationId, timestamp: new Date().toISOString() },
        error: {
          type: "NOT_FOUND",
          details: [{ code: "NOT_FOUND", message: "Device connection not found." }],
        },
      };
      res.status(404).json(body);
      return;
    }

    console.log({ event: "device.deleted", deviceId: id, correlationId });
    res.status(204).send();
  });

  return router;
}

export const devicesRouter = createDevicesRouter();

function handleConnect(
  res: Response,
  store: DeviceConnectionDao,
  userId: string,
  deviceType: DeviceType,
  provider: string | undefined,
  deviceName: string | undefined,
  correlationId: string,
): void {
  const existing = store.findByUserAndType(userId, deviceType);

  if (existing && existing.connectionStatus === "connected") {
    sendConflict(res, correlationId, `Device ${deviceType} is already connected.`);
    return;
  }

  const isNew = !existing;
  const connection = existing
    ? store.updateStatus(existing.id, "connected")
    : store.create({ userId, deviceType, provider, deviceName, batteryLevel: "Unknown" });

  console.log({
    event: isNew ? "device.paired" : "device.reconnected",
    userId,
    deviceType,
    connectionId: connection.id,
    correlationId,
  });

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: {
      device: toDeviceDto(connection),
    },
  });
}

function handleReconnect(
  res: Response,
  store: DeviceConnectionDao,
  userId: string,
  deviceType: DeviceType,
  correlationId: string,
): void {
  const existing = store.findByUserAndType(userId, deviceType);

  if (!existing) {
    sendConflict(res, correlationId, "Cannot reconnect: no prior connection record exists.");
    return;
  }

  if (existing.connectionStatus === "connected") {
    sendConflict(res, correlationId, `Device ${deviceType} is already connected.`);
    return;
  }

  const updated = store.updateStatus(existing.id, "connected");

  console.log({
    event: "device.reconnected",
    userId,
    deviceType,
    connectionId: updated.id,
    correlationId,
  });

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: {
      device: toDeviceDto(updated),
    },
  });
}

function handleDisconnect(
  res: Response,
  store: DeviceConnectionDao,
  userId: string,
  deviceType: DeviceType,
  correlationId: string,
): void {
  const existing = store.findByUserAndType(userId, deviceType);

  if (!existing) {
    sendConflict(res, correlationId, "Cannot disconnect: device is not connected.");
    return;
  }

  if (existing.connectionStatus !== "connected") {
    sendConflict(
      res,
      correlationId,
      `Cannot disconnect: device ${deviceType} is not in a connected state.`,
    );
    return;
  }

  const updated = store.updateStatus(existing.id, "disconnected");

  console.log({
    event: "device.disconnected",
    userId,
    deviceType,
    connectionId: updated.id,
    correlationId,
  });

  res.status(200).json({
    meta: { correlationId, timestamp: new Date().toISOString() },
    data: {
      device: toDeviceDto(updated),
    },
  });
}

function toDeviceDto(conn: {
  id: string;
  deviceName: string;
  provider: string;
  deviceType: DeviceType;
  connectionStatus: string;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  batteryLevel: string | null;
  connectedSince: string;
  staleAfterHours: number;
}) {
  const staleThresholdMs = conn.staleAfterHours * 60 * 60 * 1000;
  const isStale =
    conn.lastSuccessfulSyncAt === null ||
    Date.now() - new Date(conn.lastSuccessfulSyncAt).getTime() > staleThresholdMs;
  return {
    id: conn.id,
    deviceName: conn.deviceName,
    provider: conn.provider,
    deviceType: conn.deviceType,
    status: conn.connectionStatus,
    lastSyncAt: conn.lastSyncAt,
    lastSuccessfulSyncAt: conn.lastSuccessfulSyncAt,
    batteryLevel: conn.batteryLevel,
    connectedSince: conn.connectedSince,
    staleAfterHours: conn.staleAfterHours,
    isStale,
  };
}

function sendConflict(res: Response, correlationId: string, message: string): void {
  const body: ErrorResponse = {
    meta: { correlationId, timestamp: new Date().toISOString() },
    error: {
      type: "DEVICE_STATE_CONFLICT",
      details: [{ code: "DEVICE_STATE_CONFLICT", message }],
    },
  };
  res.status(409).json(body);
}

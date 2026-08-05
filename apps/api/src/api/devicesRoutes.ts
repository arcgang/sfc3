import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { DeviceConnectionDao, type DeviceType } from "../repositories/DeviceConnectionDao.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

const deviceConnectionSchema = z.object({
  deviceType: z.enum(["smartwatch", "smart_scale"]),
  action: z.enum(["connect", "reconnect", "disconnect", "sync"]),
  providerAccountRef: z.string().nullable().optional(),
  syncWindowHours: z.number().int().min(1).max(168).optional(),
});

type DeviceConnectionBody = z.infer<typeof deviceConnectionSchema>;

type TypedRequest = Request & { body: DeviceConnectionBody };

export const devicesRouter = Router();

devicesRouter.put(
  "/connections",
  validateBody(deviceConnectionSchema),
  (req: TypedRequest, res: Response): void => {
    const { deviceType, action } = req.body;
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";
    const rawUser = res.locals["user"];
    if (typeof rawUser !== "object" || rawUser === null || typeof (rawUser as Record<string, unknown>)["sub"] !== "string") {
      res.status(401).json({ meta: { correlationId, timestamp: new Date().toISOString() }, error: { type: "AUTH_TOKEN_INVALID", details: [{ code: "AUTH_TOKEN_INVALID", message: "Invalid token payload." }] } });
      return;
    }
    const userId = (rawUser as { sub: string }).sub;

    const db = getDatabase();
    const store = new DeviceConnectionDao(db);

    if (action === "connect") {
      handleConnect(res, store, userId, deviceType, correlationId);
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

    // action === "sync" — return 202 with current device state (no ingestion in this task)
    const existing = store.findByUserAndType(userId, deviceType);
    if (!existing) {
      sendConflict(res, correlationId, "Cannot sync: no connection record exists for this device.");
      return;
    }

    res.status(202).json({
      meta: { correlationId, timestamp: new Date().toISOString() },
      data: {
        device: {
          deviceType: existing.deviceType,
          status: existing.connectionStatus,
          lastSyncAt: existing.lastSyncAt,
          stale: false,
        },
        ingestion: null,
      },
    });
  },
);

function handleConnect(
  res: Response,
  store: DeviceConnectionDao,
  userId: string,
  deviceType: DeviceType,
  correlationId: string,
): void {
  const existing = store.findByUserAndType(userId, deviceType);

  if (existing && existing.connectionStatus === "connected") {
    sendConflict(res, correlationId, `Device ${deviceType} is already connected.`);
    return;
  }

  // If a row exists in any non-connected state, update it rather than insert
  const isNew = !existing;
  const connection = existing
    ? store.updateStatus(existing.id, "connected")
    : store.create({ userId, deviceType });

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
      device: {
        deviceType: connection.deviceType,
        status: connection.connectionStatus,
        lastSyncAt: connection.lastSyncAt,
        stale: false,
      },
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
      device: {
        deviceType: updated.deviceType,
        status: updated.connectionStatus,
        lastSyncAt: updated.lastSyncAt,
        stale: false,
      },
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
    sendConflict(res, correlationId, `Cannot disconnect: device ${deviceType} is not in a connected state.`);
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
      device: {
        deviceType: updated.deviceType,
        status: updated.connectionStatus,
        lastSyncAt: updated.lastSyncAt,
        stale: false,
      },
    },
  });
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

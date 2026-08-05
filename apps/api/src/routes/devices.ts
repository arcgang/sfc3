import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getDatabase } from "../db/connection.js";
import { DeviceConnectionDao, type DeviceType } from "../repositories/DeviceConnectionDao.js";
import { validateBody } from "../middleware/validate.js";
import type { ErrorResponse } from "../types/errors.js";

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

export const devicesRouter = Router();

devicesRouter.put(
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

devicesRouter.get(
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
  batteryLevel: string | null;
  connectedSince: string;
}) {
  return {
    id: conn.id,
    deviceName: conn.deviceName,
    provider: conn.provider,
    deviceType: conn.deviceType,
    status: conn.connectionStatus,
    lastSyncAt: conn.lastSyncAt,
    batteryLevel: conn.batteryLevel,
    connectedSince: conn.connectedSince,
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

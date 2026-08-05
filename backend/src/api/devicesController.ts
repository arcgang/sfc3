import type { Request, Response } from "express";
import { z } from "zod";
import {
  DeviceConnectionRepository,
  type DeviceConnectionRow,
} from "../repositories/DeviceConnectionRepository.js";
import type { ErrorResponse } from "../types/errors.js";

const DEVICE_TYPE_PROVIDER: Record<"smartwatch" | "smart_scale", string> = {
  smartwatch: "Generic Smartwatch",
  smart_scale: "Withings",
};

const deviceConnectionSchema = z.object({
  deviceType: z.enum(["smartwatch", "smart_scale"]),
  action: z.enum(["connect", "reconnect", "disconnect", "sync"]),
  providerAccountRef: z.string().nullable().optional(),
  syncWindowHours: z.number().int().min(1).max(168).optional(),
});

function deviceConflictResponse(res: Response, message: string): void {
  const correlationId =
    typeof res.locals["correlationId"] === "string"
      ? res.locals["correlationId"]
      : "";
  const body: ErrorResponse = {
    meta: {
      correlationId,
      timestamp: new Date().toISOString(),
    },
    error: {
      type: "DEVICE_STATE_CONFLICT",
      details: [{ code: "DEVICE_STATE_CONFLICT", message }],
    },
  };
  res.setHeader("X-Correlation-Id", correlationId);
  res.status(409).json(body);
}

export async function handleDeviceConnection(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = deviceConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    const correlationId =
      typeof res.locals["correlationId"] === "string"
        ? res.locals["correlationId"]
        : "";
    const body: ErrorResponse = {
      meta: { correlationId, timestamp: new Date().toISOString() },
      error: {
        type: "REQUEST_VALIDATION_FAILED",
        details: parsed.error.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          field: issue.path.join("."),
        })),
      },
    };
    res.setHeader("X-Correlation-Id", correlationId);
    res.status(422).json(body);
    return;
  }

  const { deviceType, action, providerAccountRef } = parsed.data;

  const userId = (res.locals["user"] as { sub: string }).sub;
  const correlationId =
    typeof res.locals["correlationId"] === "string"
      ? res.locals["correlationId"]
      : "";

  const repo = new DeviceConnectionRepository();
  const existing = repo.findByUserAndType(userId, deviceType);

  let row: DeviceConnectionRow;

  if (action === "connect") {
    if (existing) {
      // Upsert: update to connected
      row = repo.updateStatus(existing.id, "connected");
    } else {
      const provider = DEVICE_TYPE_PROVIDER[deviceType];
      row = repo.insert(userId, deviceType, provider, providerAccountRef ?? null);
    }
    console.log({
      event: "device.paired",
      deviceType,
      userId,
      correlationId,
    });
  } else if (action === "reconnect") {
    if (!existing) {
      deviceConflictResponse(
        res,
        "Cannot reconnect a device that has not been connected before.",
      );
      return;
    }
    row = repo.updateStatus(existing.id, "connected");
    console.log({
      event: "device.reconnected",
      deviceType,
      userId,
      correlationId,
    });
  } else if (action === "disconnect") {
    if (!existing) {
      deviceConflictResponse(
        res,
        "Cannot disconnect a device that is not connected.",
      );
      return;
    }
    row = repo.updateStatus(existing.id, "disconnected");
    console.log({
      event: "device.disconnected",
      deviceType,
      userId,
      correlationId,
    });
  } else {
    // action === "sync" — not yet implemented beyond basic response
    if (!existing) {
      deviceConflictResponse(
        res,
        "Cannot sync a device that has not been connected.",
      );
      return;
    }
    row = existing;
    console.log({
      event: "device.sync_requested",
      deviceType,
      userId,
      correlationId,
    });
  }

  res.setHeader("X-Correlation-Id", correlationId);
  res.status(200).json({
    meta: {
      correlationId,
      timestamp: new Date().toISOString(),
    },
    data: {
      device: {
        deviceType: row.device_type,
        status: row.connection_status,
        lastSyncAt: row.last_synced_at,
        stale: false,
      },
    },
  });
}

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type DeviceType = "smartwatch" | "smart_scale";
export type ConnectionStatus = "pending" | "connected" | "disconnected" | "error";

export interface DeviceConnection {
  id: string;
  userId: string;
  deviceType: DeviceType;
  connectionStatus: ConnectionStatus;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawRow {
  id: string;
  user_id: string;
  device_type: string;
  connection_status: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export class DeviceConnectionDao {
  constructor(private readonly db: Database.Database) {}

  findByUserAndType(
    userId: string,
    deviceType: DeviceType,
  ): DeviceConnection | undefined {
    const row = this.db
      .prepare(
        `SELECT id, user_id, device_type, connection_status,
                last_sync_at, created_at, updated_at
           FROM device_connections
          WHERE user_id = ? AND device_type = ?`,
      )
      .get(userId, deviceType) as RawRow | undefined;

    if (!row) return undefined;
    return this.mapRow(row);
  }

  create(params: {
    userId: string;
    deviceType: DeviceType;
  }): DeviceConnection {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO device_connections
           (id, user_id, device_type, connection_status, last_sync_at, created_at, updated_at)
         VALUES (?, ?, ?, 'connected', NULL, ?, ?)`,
      )
      .run(id, params.userId, params.deviceType, now, now);

    const created = this.findByUserAndType(params.userId, params.deviceType);
    if (!created) {
      throw new Error(`device_connections INSERT did not produce a readable row for id=${id}`);
    }
    return created;
  }

  updateStatus(
    id: string,
    status: ConnectionStatus,
  ): DeviceConnection {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE device_connections SET connection_status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, now, id);

    const row = this.db
      .prepare(
        `SELECT id, user_id, device_type, connection_status,
                last_sync_at, created_at, updated_at
           FROM device_connections WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;

    if (!row) {
      throw new Error(`device_connections UPDATE found no row for id=${id}`);
    }
    return this.mapRow(row);
  }

  private mapRow(row: RawRow): DeviceConnection {
    return {
      id: row.id,
      userId: row.user_id,
      deviceType: row.device_type as DeviceType,
      connectionStatus: row.connection_status as ConnectionStatus,
      lastSyncAt: row.last_sync_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

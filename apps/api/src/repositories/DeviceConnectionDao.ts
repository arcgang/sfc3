import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type DeviceType = "smartwatch" | "smart_scale";
export type ConnectionStatus = "pending" | "connected" | "disconnected" | "error";

export interface DeviceConnection {
  id: string;
  userId: string;
  deviceType: DeviceType;
  deviceName: string;
  provider: string;
  connectionStatus: ConnectionStatus;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  batteryLevel: string | null;
  connectedSince: string;
  staleAfterHours: number;
  createdAt: string;
  updatedAt: string;
}

interface RawRow {
  id: string;
  user_id: string;
  device_type: string;
  device_name: string;
  provider: string;
  connection_status: string;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  battery_level: string | null;
  connected_since: string;
  stale_after_hours: number;
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
        `SELECT id, user_id, device_type, device_name, provider, connection_status,
                last_sync_at, last_successful_sync_at, battery_level, connected_since,
                COALESCE(stale_after_hours, 18) AS stale_after_hours,
                created_at, updated_at
           FROM device_connections
          WHERE user_id = ? AND device_type = ?`,
      )
      .get(userId, deviceType) as RawRow | undefined;

    if (!row) return undefined;
    return this.mapRow(row);
  }

  findById(id: string): DeviceConnection | undefined {
    const row = this.db
      .prepare(
        `SELECT id, user_id, device_type, device_name, provider, connection_status,
                last_sync_at, last_successful_sync_at, battery_level, connected_since,
                COALESCE(stale_after_hours, 18) AS stale_after_hours,
                created_at, updated_at
           FROM device_connections WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;

    if (!row) return undefined;
    return this.mapRow(row);
  }

  findAllByUser(userId: string): DeviceConnection[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, device_type, device_name, provider, connection_status,
                last_sync_at, last_successful_sync_at, battery_level, connected_since,
                COALESCE(stale_after_hours, 18) AS stale_after_hours,
                created_at, updated_at
           FROM device_connections
          WHERE user_id = ?
          ORDER BY created_at ASC`,
      )
      .all(userId) as RawRow[];
    return rows.map((r) => this.mapRow(r));
  }

  create(params: {
    userId: string;
    deviceType: DeviceType;
    provider?: string;
    deviceName?: string;
    batteryLevel?: string;
  }): DeviceConnection {
    const id = randomUUID();
    const now = new Date().toISOString();
    const provider = params.provider ?? "";
    const deviceName = params.deviceName ?? "";
    const batteryLevel = params.batteryLevel ?? null;

    this.db
      .prepare(
        `INSERT INTO device_connections
           (id, user_id, device_type, device_name, provider, connection_status,
            last_sync_at, last_successful_sync_at, battery_level, connected_since,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'connected', NULL, NULL, ?, ?, ?, ?)`,
      )
      .run(id, params.userId, params.deviceType, deviceName, provider, batteryLevel, now, now, now);

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

    const conn = this.findById(id);
    if (!conn) {
      throw new Error(`device_connections UPDATE found no row for id=${id}`);
    }
    return conn;
  }

  updateLastSuccessfulSyncAt(id: string, syncedAt: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE device_connections
            SET last_successful_sync_at = ?, last_sync_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(syncedAt, syncedAt, now, id);
  }

  updateSyncNow(id: string): DeviceConnection {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE device_connections
            SET connection_status = 'connected', last_sync_at = ?,
                last_successful_sync_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(now, now, now, id);

    const conn = this.findById(id);
    if (!conn) {
      throw new Error(`device_connections UPDATE found no row for id=${id}`);
    }
    return conn;
  }

  findAll(): DeviceConnection[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, device_type, device_name, provider, connection_status,
                last_sync_at, last_successful_sync_at, battery_level, connected_since,
                COALESCE(stale_after_hours, 18) AS stale_after_hours,
                created_at, updated_at
           FROM device_connections
          ORDER BY created_at ASC`,
      )
      .all() as RawRow[];
    return rows.map((r) => this.mapRow(r));
  }

  deleteById(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM device_connections WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  createWithTimestamps(params: {
    id: string;
    userId: string;
    deviceType: DeviceType;
    deviceName: string;
    provider: string;
    connectionStatus: ConnectionStatus;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    batteryLevel: string | null;
    connectedSince: string;
    createdAt: string;
    updatedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO device_connections
           (id, user_id, device_type, device_name, provider, connection_status,
            last_sync_at, last_successful_sync_at, battery_level, connected_since,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.id,
        params.userId,
        params.deviceType,
        params.deviceName,
        params.provider,
        params.connectionStatus,
        params.lastSyncAt,
        params.lastSuccessfulSyncAt,
        params.batteryLevel,
        params.connectedSince,
        params.createdAt,
        params.updatedAt,
      );
  }

  private mapRow(row: RawRow): DeviceConnection {
    return {
      id: row.id,
      userId: row.user_id,
      deviceType: row.device_type as DeviceType,
      deviceName: row.device_name,
      provider: row.provider,
      connectionStatus: row.connection_status as ConnectionStatus,
      lastSyncAt: row.last_sync_at,
      lastSuccessfulSyncAt: row.last_successful_sync_at,
      batteryLevel: row.battery_level,
      connectedSince: row.connected_since,
      staleAfterHours: row.stale_after_hours,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

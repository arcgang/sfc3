import { v4 as uuidv4 } from "uuid";
import { getDatabase } from "../db/connection.js";

export interface DeviceConnectionRow {
  id: string;
  user_id: string;
  device_type: "smartwatch" | "smart_scale";
  connection_status: "connected" | "disconnected" | "error";
  provider: string;
  device_name: string | null;
  battery: string | null;
  connected_since: string;
  last_sync_at: string | null;
  provider_account_ref: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export class DeviceConnectionRepository {
  private get db() {
    return getDatabase();
  }

  findByUserAndType(
    userId: string,
    deviceType: "smartwatch" | "smart_scale",
  ): DeviceConnectionRow | undefined {
    return this.db
      .prepare(
        `SELECT id, user_id, device_type, connection_status, provider,
                device_name, battery, connected_since, last_sync_at,
                provider_account_ref, last_synced_at, created_at, updated_at
         FROM device_connections
         WHERE user_id = ? AND device_type = ?`,
      )
      .get(userId, deviceType) as DeviceConnectionRow | undefined;
  }

  insert(
    userId: string,
    deviceType: "smartwatch" | "smart_scale",
    providerAccountRef: string | null,
  ): DeviceConnectionRow {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO device_connections
           (id, user_id, device_type, connection_status, provider, connected_since,
            provider_account_ref, last_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, 'connected', '', ?, ?, NULL, ?, ?)`,
      )
      .run(id, userId, deviceType, now, providerAccountRef, now, now);
    return this.findByUserAndType(userId, deviceType) as DeviceConnectionRow;
  }

  updateStatus(
    id: string,
    status: "connected" | "disconnected" | "error",
  ): DeviceConnectionRow {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE device_connections SET connection_status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, now, id);
    return this.db
      .prepare(
        `SELECT id, user_id, device_type, connection_status, provider,
                device_name, battery, connected_since, last_sync_at,
                provider_account_ref, last_synced_at, created_at, updated_at
         FROM device_connections WHERE id = ?`,
      )
      .get(id) as DeviceConnectionRow;
  }
}

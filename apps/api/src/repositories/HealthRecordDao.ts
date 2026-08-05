import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type MetricDomain = "vitals" | "activity" | "sleep" | "body_composition";
export type SourceType = "smartwatch" | "smart_scale" | "user_input";

export interface HealthRecordInsert {
  userId: string;
  deviceConnectionId: string;
  metricDomain: MetricDomain;
  sourceType: SourceType;
  metricName: string;
  value: number;
  unit: string | null;
  recordedAt: string;
  measurementSessionId: string | null;
  sourcePayloadHash: string | null;
}

export class HealthRecordDao {
  constructor(private readonly db: Database.Database) {}

  insertMany(records: HealthRecordInsert[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO health_records
         (id, user_id, device_connection_id, metric_domain, source_type,
          metric_name, value, unit, recorded_at, measurement_session_id,
          source_payload_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertAll = this.db.transaction((rows: HealthRecordInsert[]) => {
      const now = new Date().toISOString();
      for (const r of rows) {
        stmt.run(
          randomUUID(),
          r.userId,
          r.deviceConnectionId,
          r.metricDomain,
          r.sourceType,
          r.metricName,
          r.value,
          r.unit,
          r.recordedAt,
          r.measurementSessionId,
          r.sourcePayloadHash,
          now,
          now,
        );
      }
    });

    insertAll(records);
  }
}

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type SyncStatus = "started" | "succeeded" | "failed" | "partial_discard";

export interface SyncRun {
  id: string;
  deviceConnectionId: string;
  syncStatus: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  recordsWritten: number | null;
  recordsDiscarded: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawRow {
  id: string;
  device_connection_id: string;
  sync_status: string;
  started_at: string;
  finished_at: string | null;
  records_written: number | null;
  records_discarded: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class SyncRunDao {
  constructor(private readonly db: Database.Database) {}

  create(deviceConnectionId: string, startedAt: string): SyncRun {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sync_runs
           (id, device_connection_id, sync_status, started_at, finished_at,
            records_written, records_discarded, error_message, created_at, updated_at)
         VALUES (?, ?, 'started', ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(id, deviceConnectionId, startedAt, now, now);

    const row = this.findById(id);
    if (!row) throw new Error(`sync_runs INSERT produced no readable row for id=${id}`);
    return row;
  }

  finish(
    id: string,
    params: {
      syncStatus: SyncStatus;
      finishedAt: string;
      recordsWritten: number;
      recordsDiscarded: number;
      errorMessage: string | null;
    },
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE sync_runs
            SET sync_status = ?, finished_at = ?, records_written = ?,
                records_discarded = ?, error_message = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        params.syncStatus,
        params.finishedAt,
        params.recordsWritten,
        params.recordsDiscarded,
        params.errorMessage,
        now,
        id,
      );
  }

  findById(id: string): SyncRun | undefined {
    const row = this.db
      .prepare(
        `SELECT id, device_connection_id, sync_status, started_at, finished_at,
                records_written, records_discarded, error_message, created_at, updated_at
           FROM sync_runs WHERE id = ?`,
      )
      .get(id) as RawRow | undefined;

    if (!row) return undefined;
    return this.mapRow(row);
  }

  private mapRow(row: RawRow): SyncRun {
    return {
      id: row.id,
      deviceConnectionId: row.device_connection_id,
      syncStatus: row.sync_status as SyncStatus,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      recordsWritten: row.records_written,
      recordsDiscarded: row.records_discarded,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

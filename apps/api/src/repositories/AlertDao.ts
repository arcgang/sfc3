import type Database from "better-sqlite3";

export type AlertCategory = "stale_data" | "abnormal_reading" | "goal_risk" | "sync_failure";
export type AlertPriority = "high" | "medium" | "low";

export interface Alert {
  id: number;
  userId: string;
  category: AlertCategory;
  priority: AlertPriority;
  message: string;
  ruleKey: string | null;
  entityId: string | null;
  entityType: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface CreateAlertParams {
  userId: string;
  category: AlertCategory;
  priority: AlertPriority;
  message: string;
  ruleKey?: string | null;
  entityId?: string | null;
  entityType?: string | null;
}

interface RawRow {
  id: number;
  user_id: string;
  category: string;
  priority: string;
  message: string;
  rule_key: string | null;
  entity_id: string | null;
  entity_type: string | null;
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
}

export class AlertDao {
  constructor(private readonly db: Database.Database) {}

  create(params: CreateAlertParams): Alert {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO alerts
           (user_id, category, priority, message, rule_key, entity_id, entity_type,
            acknowledged, acknowledged_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
      )
      .run(
        params.userId,
        params.category,
        params.priority,
        params.message,
        params.ruleKey ?? null,
        params.entityId ?? null,
        params.entityType ?? null,
        now,
      );

    const id = result.lastInsertRowid as number;
    const row = this.db
      .prepare(
        `SELECT id, user_id, category, priority, message, rule_key, entity_id, entity_type,
                acknowledged, acknowledged_at, created_at
           FROM alerts WHERE id = ?`,
      )
      .get(id) as RawRow;

    return this.mapRow(row);
  }

  listUnacknowledged(userId: string): Alert[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, category, priority, message, rule_key, entity_id, entity_type,
                acknowledged, acknowledged_at, created_at
           FROM alerts
          WHERE user_id = ? AND acknowledged = 0
          ORDER BY created_at DESC
          LIMIT 200`,
      )
      .all(userId) as RawRow[];
    return rows.map((r) => this.mapRow(r));
  }

  findByUser(userId: string, includeAcknowledged = false): Alert[] {
    const sql = includeAcknowledged
      ? `SELECT id, user_id, category, priority, message, rule_key, entity_id, entity_type,
                acknowledged, acknowledged_at, created_at
           FROM alerts
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 200`
      : `SELECT id, user_id, category, priority, message, rule_key, entity_id, entity_type,
                acknowledged, acknowledged_at, created_at
           FROM alerts
          WHERE user_id = ? AND acknowledged = 0
          ORDER BY created_at DESC
          LIMIT 200`;

    const rows = this.db.prepare(sql).all(userId) as RawRow[];
    return rows.map((r) => this.mapRow(r));
  }

  acknowledge(id: number, userId: string): Alert | undefined {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE alerts
            SET acknowledged = 1, acknowledged_at = ?
          WHERE id = ? AND user_id = ? AND acknowledged = 0`,
      )
      .run(now, id, userId);

    const row = this.db
      .prepare(
        `SELECT id, user_id, category, priority, message, rule_key, entity_id, entity_type,
                acknowledged, acknowledged_at, created_at
           FROM alerts WHERE id = ? AND user_id = ?`,
      )
      .get(id, userId) as RawRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  private mapRow(row: RawRow): Alert {
    return {
      id: row.id,
      userId: row.user_id,
      category: row.category as AlertCategory,
      priority: row.priority as AlertPriority,
      message: row.message,
      ruleKey: row.rule_key,
      entityId: row.entity_id,
      entityType: row.entity_type,
      acknowledged: row.acknowledged === 1,
      acknowledgedAt: row.acknowledged_at,
      createdAt: row.created_at,
    };
  }
}

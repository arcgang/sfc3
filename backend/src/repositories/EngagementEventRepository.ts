import type Database from "better-sqlite3";

export interface CreateEngagementEventParams {
  id: string;
  userId: string;
  eventType: string;
  eventDate: string;
  eventTimestamp: string;
  eventContextJson: string;
}

export class EngagementEventRepository {
  constructor(private readonly db: Database.Database) {}

  insert(params: CreateEngagementEventParams): void {
    this.db
      .prepare(
        // occurred_at and event_timestamp both receive @eventTimestamp; event_date receives @eventDate
        `INSERT INTO engagement_events
           (id, user_id, event_type, occurred_at, event_date, event_timestamp, event_context_json)
         VALUES
           (@id, @userId, @eventType, @eventTimestamp, @eventDate, @eventTimestamp, @eventContextJson)`,
      )
      .run(params);
  }
}

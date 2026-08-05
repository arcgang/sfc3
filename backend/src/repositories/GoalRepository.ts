import type Database from "better-sqlite3";

export interface GoalRow {
  id: string;
  user_id: string;
  goal_type: string;
  target_value: number;
  target_unit: string;
  cadence: string;
  start_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGoalParams {
  id: string;
  userId: string;
  goalType: string;
  targetValue: number;
  targetUnit: string;
  cadence: string;
  startDate: string;
  now: string;
}

export class GoalRepository {
  constructor(private readonly db: Database.Database) {}

  insert(params: CreateGoalParams): GoalRow {
    this.db
      .prepare(
        `INSERT INTO goals
           (id, user_id, goal_type, target_value, target_unit, cadence, start_date, status, created_at, updated_at)
         VALUES
           (@id, @userId, @goalType, @targetValue, @targetUnit, @cadence, @startDate, 'active', @now, @now)`,
      )
      .run(params);

    const row = this.db
      .prepare(
        `SELECT id, user_id, goal_type, target_value, target_unit, cadence, start_date, status, created_at, updated_at
           FROM goals WHERE id = @id`,
      )
      .get({ id: params.id }) as GoalRow | undefined;

    if (row === undefined) {
      throw new Error(`Goal insert succeeded but row ${params.id} was not found on re-read`);
    }

    return row;
  }
}

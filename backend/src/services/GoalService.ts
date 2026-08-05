import { v4 as uuidv4 } from "uuid";
import type Database from "better-sqlite3";
import { GoalRepository } from "../repositories/GoalRepository.js";
import { EngagementEventRepository } from "../repositories/EngagementEventRepository.js";

export interface CreateGoalInput {
  goalType: string;
  targetValue: number;
  targetUnit: string;
  cadence: string;
  startDate?: string;
}

export interface CreatedGoal {
  id: string;
  goalType: string;
  targetValue: number;
  targetUnit: string;
  cadence: string;
  status: "active";
}

export interface CreateGoalResult {
  goal: CreatedGoal;
  engagementEventRecorded: boolean;
}

export class GoalService {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(userId: string, input: CreateGoalInput): CreateGoalResult {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const goalId = uuidv4();
    const eventId = uuidv4();

    const goalRepo = new GoalRepository(this.db);
    const eventRepo = new EngagementEventRepository(this.db);

    // Both writes in one transaction so a partial failure rolls back entirely
    const row = this.db.transaction(() => {
      const inserted = goalRepo.insert({
        id: goalId,
        userId,
        goalType: input.goalType,
        targetValue: input.targetValue,
        targetUnit: input.targetUnit,
        cadence: input.cadence,
        startDate: input.startDate ?? today,
        now,
      });

      eventRepo.insert({
        id: eventId,
        userId,
        eventType: "goal_create",
        eventDate: today,
        eventTimestamp: now,
        eventContextJson: JSON.stringify({ goalId }),
      });

      return inserted;
    })();

    return {
      goal: {
        id: row.id,
        goalType: row.goal_type,
        targetValue: row.target_value,
        targetUnit: row.target_unit,
        cadence: row.cadence,
        status: "active",
      },
      engagementEventRecorded: true,
    };
  }
}

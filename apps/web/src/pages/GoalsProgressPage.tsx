import { useState } from "react";
import { apiFetch } from "../api.js";
import styles from "./GoalsProgressPage.module.css";

type GoalType =
  | "steps_daily"
  | "sleep_minutes_daily"
  | "weight_target"
  | "active_minutes_weekly";

type Cadence = "daily" | "weekly";

interface GoalRow {
  id: string;
  goal_type: GoalType;
  target_value: number;
  target_unit: string;
  cadence: Cadence;
  start_date: string;
  status: "active" | "completed" | "abandoned";
}

interface CreateGoalBody {
  goalType: GoalType;
  targetValue: number;
  targetUnit: string;
  cadence: Cadence;
  startDate?: string;
}

interface ApiError {
  error: {
    type: string;
    details: Array<{ path: string[]; message: string }>;
  };
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  steps_daily: "Walk steps daily",
  sleep_minutes_daily: "Sleep minutes daily",
  weight_target: "Weight target",
  active_minutes_weekly: "Exercise active minutes weekly",
};

const GOAL_TYPE_DEFAULT_UNIT: Record<GoalType, string> = {
  steps_daily: "steps",
  sleep_minutes_daily: "minutes",
  weight_target: "lbs",
  active_minutes_weekly: "minutes",
};

const GOAL_TYPE_CADENCE: Record<GoalType, Cadence> = {
  steps_daily: "daily",
  sleep_minutes_daily: "daily",
  weight_target: "daily",
  active_minutes_weekly: "weekly",
};

const STATUS_LABEL: Record<string, string> = {
  active: "On Track",
};

function goalTypeLabel(type: GoalType): string {
  return GOAL_TYPE_LABELS[type] ?? type;
}

function statusBadgeClass(status: string): string {
  if (status === "active") return styles.badgeActive;
  if (status === "at_risk") return styles.badgeAtRisk;
  if (status === "missed") return styles.badgeMissed;
  return styles.badgeActive;
}

const INITIAL_GOALS: GoalRow[] = [];

export function GoalsProgressPage() {
  const [goals, setGoals] = useState<GoalRow[]>(INITIAL_GOALS);
  const [showForm, setShowForm] = useState(false);

  const [goalType, setGoalType] = useState<GoalType>("steps_daily");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("steps");
  const [startDate, setStartDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleGoalTypeChange(type: GoalType) {
    setGoalType(type);
    setTargetUnit(GOAL_TYPE_DEFAULT_UNIT[type]);
    setFieldErrors({});
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const numericTarget = Number(targetValue);
    if (!targetValue || isNaN(numericTarget) || numericTarget <= 0) {
      setFieldErrors({ targetValue: "Target value must be a number greater than 0." });
      return;
    }

    const body: CreateGoalBody = {
      goalType,
      targetValue: numericTarget,
      targetUnit: targetUnit.trim() || GOAL_TYPE_DEFAULT_UNIT[goalType],
      cadence: GOAL_TYPE_CADENCE[goalType],
    };
    if (startDate) body.startDate = startDate;

    setSubmitting(true);
    try {
      const result = await apiFetch<{ data: GoalRow }>("/goals", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setGoals((prev) => [...prev, result.data]);
      setShowForm(false);
      setTargetValue("");
      setStartDate("");
      setGoalType("steps_daily");
      setTargetUnit("steps");
    } catch (err: unknown) {
      if (err instanceof Error) {
        try {
          const parsed: ApiError = JSON.parse(err.message);
          const errors: Record<string, string> = {};
          for (const detail of parsed.error.details) {
            const key = detail.path[0] ?? "form";
            errors[key] = detail.message;
          }
          setFieldErrors(errors);
        } catch {
          setFormError(err.message || "Failed to create goal. Please try again.");
        }
      } else {
        setFormError("Failed to create goal. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Goals &amp; Progress</h1>
        <button
          type="button"
          className={styles.createButton}
          onClick={() => setShowForm(true)}
        >
          + Create New Goal
        </button>
      </div>

      {showForm && (
        <section aria-labelledby="create-goal-heading" className={styles.formSection}>
          <h2 id="create-goal-heading">Create New Goal</h2>

          {formError && (
            <p role="alert" className={styles.formError}>
              {formError}
            </p>
          )}

          <form onSubmit={handleSubmit} aria-label="Create goal form" className={styles.form} noValidate>
            <div className={styles.field}>
              <label htmlFor="goalType">Goal type</label>
              <select
                id="goalType"
                name="goalType"
                value={goalType}
                onChange={(e) => handleGoalTypeChange(e.target.value as GoalType)}
              >
                <option value="steps_daily">Daily steps</option>
                <option value="sleep_minutes_daily">Sleep (minutes daily)</option>
                <option value="weight_target">Weight target</option>
                <option value="active_minutes_weekly">Active minutes (weekly)</option>
              </select>
              {fieldErrors["goalType"] && (
                <span role="alert" className={styles.fieldError}>{fieldErrors["goalType"]}</span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="targetValue">Target value</label>
              <input
                id="targetValue"
                name="targetValue"
                type="number"
                min="0.001"
                step="any"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                aria-describedby={fieldErrors["targetValue"] ? "targetValue-error" : undefined}
                required
              />
              {fieldErrors["targetValue"] && (
                <span id="targetValue-error" role="alert" className={styles.fieldError}>
                  {fieldErrors["targetValue"]}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="targetUnit">Unit</label>
              <input
                id="targetUnit"
                name="targetUnit"
                type="text"
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="startDate">Start date (optional)</label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className={styles.formActions}>
              <button type="submit" className={styles.submitButton} disabled={submitting}>
                {submitting ? "Saving…" : "Save Goal"}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  setShowForm(false);
                  setFieldErrors({});
                  setFormError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section aria-labelledby="goals-list-heading">
        <h2 id="goals-list-heading" className="sr-only">Your Goals</h2>
        {goals.length === 0 ? (
          <p className={styles.emptyState}>
            No goals yet. Create your first goal to start tracking your progress.
          </p>
        ) : (
          <ul className={styles.goalsList}>
            {goals.map((goal) => (
              <li key={goal.id} className={styles.goalCard}>
                <div className={styles.goalHeader}>
                  <span className={`${styles.statusBadge} ${statusBadgeClass(goal.status)}`}>
                    {STATUS_LABEL[goal.status] ?? goal.status}
                  </span>
                  <h3>{goalTypeLabel(goal.goal_type)}</h3>
                </div>
                <p className={styles.goalMeta}>
                  {goal.cadence === "daily" ? "Daily goal" : "Weekly goal"}
                  {goal.start_date ? ` • Started ${goal.start_date}` : ""}
                </p>
                <p className={styles.goalTarget}>
                  Target: {goal.target_value} {goal.target_unit}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="goal-insights-heading" className={styles.insightsSection}>
        <h2 id="goal-insights-heading">Goal Insights</h2>
        <div className={styles.insightCard}>
          <span aria-hidden="true">💡</span>
          <div>
            <strong>Consistency Pays Off</strong>
            <p>
              {"You've hit your step goal 5 days in a row. Maintaining this consistency will help you reach your monthly activity target ahead of schedule."}
            </p>
          </div>
        </div>
        <div className={styles.insightCard}>
          <span aria-hidden="true">🎯</span>
          <div>
            <strong>Weight Loss Strategy</strong>
            <p>
              To get back on track with your weight goal, try increasing your weekly exercise by 30 minutes and tracking your calorie intake more closely.
            </p>
          </div>
        </div>
        <p className={styles.comingSoon}>
          Explore structured programs to reach your goals
          <br />
          <span>Coming Soon</span>
        </p>
      </section>
    </div>
  );
}

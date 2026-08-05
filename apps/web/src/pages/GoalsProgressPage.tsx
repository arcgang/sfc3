import { useState, useEffect } from "react";
import { apiFetch } from "../api.js";
import styles from "./GoalsProgressPage.module.css";

type GoalType =
  | "steps_daily"
  | "sleep_minutes_daily"
  | "weight_target"
  | "active_minutes_weekly";

type Cadence = "daily" | "weekly";

type GoalStatus = "active" | "at_risk" | "missed" | "completed" | "abandoned";

interface GoalRow {
  id: string;
  goalType: GoalType;
  targetValue: number;
  targetUnit: string;
  cadence: Cadence;
  startDate: string;
  status: GoalStatus;
  currentValue?: number;
  weekOverWeekChange?: string | null;
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

const GOAL_TYPE_ICONS: Record<GoalType, string> = {
  steps_daily: "🚶",
  sleep_minutes_daily: "😴",
  weight_target: "⚖️",
  active_minutes_weekly: "🏃",
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
  at_risk: "At Risk",
  missed: "Missed",
  completed: "Completed",
  abandoned: "Archived",
};

function goalTypeLabel(type: GoalType): string {
  return GOAL_TYPE_LABELS[type] ?? type;
}

function goalTypeIcon(type: GoalType): string {
  return GOAL_TYPE_ICONS[type] ?? "🎯";
}

function statusBadgeClass(status: string): string {
  if (status === "active") return styles.badgeActive;
  if (status === "at_risk") return styles.badgeAtRisk;
  if (status === "missed") return styles.badgeMissed;
  if (status === "completed") return styles.badgeCompleted;
  return styles.badgeArchived;
}

function isActiveGoal(status: GoalStatus): boolean {
  return status === "active" || status === "at_risk" || status === "missed";
}

function progressPercent(currentValue: number | undefined, targetValue: number): number {
  if (currentValue === undefined || targetValue <= 0) return 0;
  return Math.min(100, Math.round((currentValue / targetValue) * 100));
}

export function GoalsProgressPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [goalType, setGoalType] = useState<GoalType>("steps_daily");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("steps");
  const [startDate, setStartDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    apiFetch<{ data: { goals: GoalRow[] } }>("/goals")
      .then((res) => {
        if (!cancelled) {
          setGoals(res.data.goals);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load goals.",
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const result = await apiFetch<{ data: { goal: GoalRow } }>("/goals", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setGoals((prev) => [result.data.goal, ...prev]);
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

  const activeGoals = goals.filter((g) => isActiveGoal(g.status));
  const completedGoals = goals.filter((g) => !isActiveGoal(g.status));

  function renderGoalCard(goal: GoalRow) {
    const pct = progressPercent(goal.currentValue, goal.targetValue);
    const hasProgress = goal.currentValue !== undefined;

    return (
      <li key={goal.id} className={`${styles.goalCard} ${!isActiveGoal(goal.status) ? styles.goalCardMuted : ""}`}>
        <div className={styles.goalHeader}>
          <span className={styles.goalIcon} aria-hidden="true">
            {goalTypeIcon(goal.goalType)}
          </span>
          <div className={styles.goalHeaderText}>
            <span className={`${styles.statusBadge} ${statusBadgeClass(goal.status)}`}>
              {STATUS_LABEL[goal.status] ?? goal.status}
            </span>
            <h3>{goalTypeLabel(goal.goalType)}</h3>
          </div>
        </div>
        <p className={styles.goalMeta}>
          {goal.cadence === "daily" ? "Daily goal" : "Weekly goal"}
          {goal.startDate ? ` • Started ${goal.startDate}` : ""}
        </p>
        {hasProgress ? (
          <>
            <p className={styles.goalProgress}>
              {goal.currentValue} {goal.targetUnit} / {goal.targetValue} {goal.targetUnit}
            </p>
            <div
              className={styles.progressBarTrack}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goalTypeLabel(goal.goalType)} progress: ${pct}%`}
            >
              <div
                className={`${styles.progressBarFill} ${statusBadgeClass(goal.status) === styles.badgeActive ? styles.progressFillOnTrack : statusBadgeClass(goal.status) === styles.badgeAtRisk ? styles.progressFillAtRisk : styles.progressFillMissed}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <p className={styles.goalTarget}>
            Target: {goal.targetValue} {goal.targetUnit}
          </p>
        )}
        {goal.weekOverWeekChange && (
          <p className={styles.weekOverWeek}>{goal.weekOverWeekChange}</p>
        )}
      </li>
    );
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
        {loading ? (
          <p className={styles.loadingState}>Loading goals…</p>
        ) : loadError ? (
          <p role="alert" className={styles.errorState}>
            {loadError}{" "}
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                apiFetch<{ data: { goals: GoalRow[] } }>("/goals")
                  .then((res) => {
                    setGoals(res.data.goals);
                    setLoading(false);
                  })
                  .catch((err: unknown) => {
                    setLoadError(
                      err instanceof Error ? err.message : "Failed to load goals.",
                    );
                    setLoading(false);
                  });
              }}
            >
              Retry
            </button>
          </p>
        ) : goals.length === 0 ? (
          <p className={styles.emptyState}>
            No goals yet. Create your first goal to start tracking your progress.
          </p>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <ul className={styles.goalsList}>
                {activeGoals.map(renderGoalCard)}
              </ul>
            )}
            {completedGoals.length > 0 && (
              <section aria-labelledby="completed-goals-heading" className={styles.completedSection}>
                <h2 id="completed-goals-heading" className={styles.completedHeading}>Completed &amp; Archived</h2>
                <ul className={styles.goalsList}>
                  {completedGoals.map(renderGoalCard)}
                </ul>
              </section>
            )}
          </>
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

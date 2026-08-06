import { useState } from "react";
import { apiFetch } from "../api.js";
import { useGoals } from "../hooks/useGoals.js";
import type { GoalWithProgress, GoalInsight } from "../hooks/useGoals.js";
import styles from "./GoalsProgressPage.module.css";

type GoalType =
  | "steps_daily"
  | "sleep_minutes_daily"
  | "weight_target"
  | "active_minutes_weekly";

type Cadence = "daily" | "weekly";

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

const GOAL_TYPE_ICONS: Record<string, string> = {
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
  on_track: "On Track",
  at_risk: "At Risk",
  missed: "Missed",
  completed: "Completed",
  archived: "Archived",
};

function goalTypeLabel(type: string): string {
  return GOAL_TYPE_LABELS[type as GoalType] ?? type;
}

function goalTypeIcon(type: string): string {
  return GOAL_TYPE_ICONS[type] ?? "🎯";
}

function statusBadgeClass(status: string): string {
  if (status === "on_track") return styles.badgeActive;
  if (status === "at_risk") return styles.badgeAtRisk;
  if (status === "missed") return styles.badgeMissed;
  if (status === "completed") return styles.badgeCompleted;
  return styles.badgeArchived;
}

function progressFillClass(status: string): string {
  if (status === "on_track") return styles.progressFillOnTrack;
  if (status === "at_risk") return styles.progressFillAtRisk;
  return styles.progressFillMissed;
}

function insightIcon(insight: GoalInsight): string {
  const title = insight.title.toLowerCase();
  if (
    title.includes("consistency") ||
    title.includes("streak") ||
    title.includes("sleep") ||
    title.includes("improvement")
  ) {
    return "💡";
  }
  if (
    title.includes("strategy") ||
    title.includes("weight") ||
    title.includes("target")
  ) {
    return "🎯";
  }
  return "💡";
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const pct = goal.progressPercent ?? 0;
  const hasProgress = goal.currentDisplay !== undefined;
  const isMuted = goal.section !== "active";

  return (
    <li className={`${styles.goalCard} ${isMuted ? styles.goalCardMuted : ""}`}>
      <div className={styles.goalHeader}>
        <div className={styles.goalIcon} aria-hidden="true">
          {goalTypeIcon(goal.goalType)}
        </div>
        <span className={`${styles.statusBadge} ${statusBadgeClass(goal.status)}`}>
          {STATUS_LABEL[goal.status] ?? goal.status}
        </span>
      </div>
      <h3 className={styles.goalName}>{goalTypeLabel(goal.goalType)}</h3>
      <p className={styles.goalMeta}>
        {goal.cadence === "daily" ? "Daily goal" : "Weekly goal"}
        {goal.startDate ? ` • Started ${goal.startDate}` : ""}
      </p>
      {hasProgress ? (
        <>
          <p className={styles.goalProgress}>{goal.currentDisplay}</p>
          <div
            className={styles.progressBarTrack}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goalTypeLabel(goal.goalType)} progress: ${pct}%`}
          >
            <div
              className={`${styles.progressBarFill} ${progressFillClass(goal.status)}`}
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

export function GoalsProgressPage() {
  const { goals: fetchedGoals, insights, loading, error: loadError } = useGoals();

  const [localGoals, setLocalGoals] = useState<GoalWithProgress[] | null>(null);
  const displayGoals = localGoals ?? fetchedGoals;

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
      const result = await apiFetch<{ data: { goal: GoalWithProgress } }>("/goals", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const newGoal: GoalWithProgress = { ...result.data.goal, section: "active" };
      setLocalGoals((prev) => [newGoal, ...(prev ?? fetchedGoals)]);
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

  const activeGoals = displayGoals.filter((g) => g.section === "active");
  const completedGoals = displayGoals.filter((g) => g.section !== "active");

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
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </p>
        ) : displayGoals.length === 0 ? (
          <p className={styles.emptyState}>
            No goals yet. Create your first goal to start tracking your progress.
          </p>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <ul className={styles.goalsList}>
                {activeGoals.map((g) => <GoalCard key={g.id} goal={g} />)}
              </ul>
            )}
            {completedGoals.length > 0 && (
              <section aria-labelledby="completed-goals-heading" className={styles.completedSection}>
                <h2 id="completed-goals-heading" className={styles.completedHeading}>Completed &amp; Archived</h2>
                <ul className={styles.goalsList}>
                  {completedGoals.map((g) => <GoalCard key={g.id} goal={g} />)}
                </ul>
              </section>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="goal-insights-heading" className={styles.insightsSection}>
        <h2 id="goal-insights-heading">Goal Insights</h2>
        {insights.length > 0 ? (
          insights.map((insight) => (
            <div key={insight.id} className={styles.insightCard}>
              <span aria-hidden="true">{insightIcon(insight)}</span>
              <div>
                <strong>{insight.title}</strong>
                <p>{insight.body}</p>
              </div>
            </div>
          ))
        ) : (
          <>
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
          </>
        )}
        <section aria-labelledby="coming-soon-heading" className={styles.comingSoonSection}>
          <h2 id="coming-soon-heading" className={styles.comingSoonHeading}>
            Explore structured programs to reach your goals
          </h2>
          <p className={styles.comingSoonSubtitle}>
            Join guided wellness programs designed by experts to help you achieve lasting results
          </p>
          <span className={styles.comingSoonBadge}>Coming Soon</span>
        </section>
      </section>
    </div>
  );
}

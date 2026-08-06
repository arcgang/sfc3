import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./DashboardPage.module.css";

// ── Types mirroring the API response ─────────────────────────────────────────

type CardId = "HeartRate" | "Steps" | "BloodPressure" | "Sleep";

interface SummaryCard {
  id: CardId;
  label: string;
  value: number | string | null;
  unit: string;
  badge: string;
  emptyState: boolean;
}

interface DeviceSyncStatus {
  deviceType: string;
  status: string;
  lastSyncAt: string | null;
  stale: boolean;
}

interface LastSyncStatus {
  overallLastSyncAt: string | null;
  isStale: boolean;
  staleThresholdHours: number;
  stalenessLabel: string;
  deviceStatuses: DeviceSyncStatus[];
}

interface GoalSummary {
  id: string;
  status: string;
}

interface StepsDayPoint {
  date: string;
  stepCount: number;
}

interface HeartRatePoint {
  recordedAt: string;
  bpm: number;
}

interface SleepDayPoint {
  date: string;
  minutes: number;
}

interface WeightDayPoint {
  date: string;
  kg: number;
}

interface TrendsData {
  steps7d: StepsDayPoint[];
  heartRateToday: HeartRatePoint[];
  sleepMinutes7d: SleepDayPoint[];
  weight7d: WeightDayPoint[];
  stepsGoal: number | null;
}

interface DashboardPayload {
  greeting: string;
  personaMode: string;
  summaryCards: SummaryCard[];
  lastSyncStatus: LastSyncStatus;
  trends?: TrendsData;
}

interface GoalCounts {
  onTrack: number;
  atRisk: number;
  missed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CARD_ICON: Record<CardId, string> = {
  HeartRate: "❤️",
  Steps: "🚶",
  BloodPressure: "🩺",
  Sleep: "😴",
};

function formatValue(card: SummaryCard): string {
  if (card.value === null) return "";
  if (card.id === "Sleep" && typeof card.value === "number") {
    const h = (card.value / 60).toFixed(1);
    return `${h}h`;
  }
  if (typeof card.value === "number" && card.id === "Steps") {
    return card.value.toLocaleString();
  }
  return String(card.value);
}

function relativeTime(isoString: string | null): string {
  if (!isoString) return "unknown";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} hour${diffH !== 1 ? "s" : ""} ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} day${diffD !== 1 ? "s" : ""} ago`;
}

function computeCounts(goals: GoalSummary[]): GoalCounts {
  return {
    onTrack: goals.filter((g) => g.status === "active").length,
    atRisk: goals.filter((g) => g.status === "at_risk").length,
    missed: goals.filter((g) => g.status === "missed").length,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MetricCardProps {
  card: SummaryCard;
}

function MetricCard({ card }: MetricCardProps) {
  const icon = CARD_ICON[card.id];
  const label = `${card.label} ${icon}`;

  if (card.emptyState) {
    return (
      <li className={styles.metricCard} data-card-id={card.id}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricEmpty}>
          No device connected — set up a device to see this metric
        </span>
      </li>
    );
  }

  return (
    <li className={styles.metricCard} data-card-id={card.id}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>
        {formatValue(card)}
        {card.unit === "mmHg" || card.id === "BloodPressure" ? "" : ""}
      </strong>
      {card.badge && <span className={styles.metricStatus}>{card.badge}</span>}
    </li>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

const CHART_W = 480;
const CHART_H = 140;
const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

function scaleY(value: number, min: number, max: number): number {
  if (max === min) return PAD.top + PLOT_H / 2;
  return PAD.top + PLOT_H - ((value - min) / (max - min)) * PLOT_H;
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return PAD.left + PLOT_W / 2;
  return PAD.left + (index / (count - 1)) * PLOT_W;
}

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return DAYS_SHORT[d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1] ?? dateStr.slice(5);
}

// ── Heart Rate line chart ─────────────────────────────────────────────────────

interface HeartRateChartProps {
  points: HeartRatePoint[];
}

function HeartRateChart({ points }: HeartRateChartProps) {
  if (points.length < 2) {
    return (
      <div className={styles.chartEmpty} aria-label="Today's Heart Rate Fluctuations">
        <p>Not enough heart rate data for today yet — readings will appear once your smartwatch syncs.</p>
      </div>
    );
  }

  const bpms = points.map((p) => p.bpm);
  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);
  const currentBpm = bpms[bpms.length - 1]!;

  const pathPoints = points.map((p, i) => {
    const x = scaleX(i, points.length);
    const y = scaleY(p.bpm, minBpm, maxBpm);
    return `${x},${y}`;
  });
  const d = `M ${pathPoints.join(" L ")}`;

  // x-axis: show up to 5 evenly spaced time labels
  const tickCount = Math.min(5, points.length);
  const tickIndices = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i / (tickCount - 1)) * (points.length - 1)),
  );

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartMeta} aria-label={`Range: ${minBpm}–${maxBpm} BPM | Current: ${currentBpm} BPM`}>
        Range: {minBpm}–{maxBpm} BPM | Current: {currentBpm} BPM
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Line chart of today's heart rate fluctuations, range ${minBpm} to ${maxBpm} BPM`}
        className={styles.chart}
      >
        {/* y-axis labels */}
        {[minBpm, Math.round((minBpm + maxBpm) / 2), maxBpm].map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={scaleY(v, minBpm, maxBpm) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            className={styles.chartAxisLabel}
          >
            {v}
          </text>
        ))}
        {/* x-axis tick labels */}
        {tickIndices.map((idx) => {
          const p = points[idx]!;
          const x = scaleX(idx, points.length);
          const timeStr = new Date(p.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <text
              key={idx}
              x={x}
              y={CHART_H - 4}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className={styles.chartAxisLabel}
            >
              {timeStr}
            </text>
          );
        })}
        {/* axis lines */}
        <line
          x1={PAD.left} y1={PAD.top}
          x2={PAD.left} y2={PAD.top + PLOT_H}
          stroke="currentColor" strokeOpacity="0.2" strokeWidth="1"
        />
        <line
          x1={PAD.left} y1={PAD.top + PLOT_H}
          x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
          stroke="currentColor" strokeOpacity="0.2" strokeWidth="1"
        />
        {/* line */}
        <path d={d} fill="none" stroke="var(--color-accent, #2563eb)" strokeWidth="2" strokeLinejoin="round" />
        {/* current dot */}
        <circle
          cx={scaleX(points.length - 1, points.length)}
          cy={scaleY(currentBpm, minBpm, maxBpm)}
          r="4"
          fill="var(--color-accent, #2563eb)"
        />
      </svg>
    </div>
  );
}

// ── Steps bar chart ───────────────────────────────────────────────────────────

interface StepsChartProps {
  points: StepsDayPoint[];
  goal: number | null;
}

function StepsChart({ points, goal }: StepsChartProps) {
  if (points.length < 2) {
    return (
      <div className={styles.chartEmpty} aria-label="This Week's Step Activity">
        <p>Not enough step data this week yet — data will appear once your smartwatch syncs for at least two days.</p>
      </div>
    );
  }

  const maxSteps = Math.max(...points.map((p) => p.stepCount), goal ?? 0, 1);
  const barW = Math.floor(PLOT_W / points.length) - 4;

  const goalY = goal !== null ? scaleY(goal, 0, maxSteps) : null;

  return (
    <div className={styles.chartWrapper}>
      {goal !== null && (
        <div className={styles.chartMeta}>
          Goal: {goal.toLocaleString()} steps/day
        </div>
      )}
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Bar chart of this week's step activity${goal !== null ? `, goal ${goal.toLocaleString()} steps per day` : ""}`}
        className={styles.chart}
      >
        {/* y-axis labels */}
        {[0, Math.round(maxSteps / 2), maxSteps].map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={scaleY(v, 0, maxSteps) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            className={styles.chartAxisLabel}
          >
            {v >= 1000 ? `${Math.round(v / 1000)}k` : v}
          </text>
        ))}
        {/* axis lines */}
        <line
          x1={PAD.left} y1={PAD.top}
          x2={PAD.left} y2={PAD.top + PLOT_H}
          stroke="currentColor" strokeOpacity="0.2" strokeWidth="1"
        />
        <line
          x1={PAD.left} y1={PAD.top + PLOT_H}
          x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
          stroke="currentColor" strokeOpacity="0.2" strokeWidth="1"
        />
        {/* bars */}
        {points.map((p, i) => {
          const barX = PAD.left + (i / points.length) * PLOT_W + 2;
          const barY = scaleY(p.stepCount, 0, maxSteps);
          const barH = PAD.top + PLOT_H - barY;
          return (
            <g key={p.date}>
              <rect
                x={barX}
                y={barY}
                width={barW}
                height={Math.max(barH, 0)}
                fill="var(--color-accent, #2563eb)"
                opacity="0.75"
                rx="2"
                aria-label={`${dayLabel(p.date)}: ${p.stepCount.toLocaleString()} steps`}
              />
              <text
                x={barX + barW / 2}
                y={CHART_H - 4}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                className={styles.chartAxisLabel}
              >
                {dayLabel(p.date)}
              </text>
            </g>
          );
        })}
        {/* goal reference line */}
        {goalY !== null && (
          <>
            <line
              x1={PAD.left}
              y1={goalY}
              x2={PAD.left + PLOT_W}
              y2={goalY}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <text
              x={PAD.left + PLOT_W - 2}
              y={goalY - 4}
              textAnchor="end"
              fontSize="10"
              fill="#ef4444"
            >
              Goal
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Sleep line chart ──────────────────────────────────────────────────────────

interface SleepChartProps {
  points: SleepDayPoint[];
}

function SleepChart({ points }: SleepChartProps) {
  if (points.length < 2) {
    return (
      <div className={styles.chartEmpty} aria-label="7-Day Sleep Duration">
        <p>Not enough sleep data this week yet — data will appear once your smartwatch syncs for at least two days.</p>
      </div>
    );
  }

  const minutes = points.map((p) => p.minutes);
  const minM = Math.min(...minutes);
  const maxM = Math.max(...minutes);

  const pathPoints = points.map((p, i) => {
    const x = scaleX(i, points.length);
    const y = scaleY(p.minutes, minM, maxM);
    return `${x},${y}`;
  });
  const d = `M ${pathPoints.join(" L ")}`;

  const toHours = (m: number) => (m / 60).toFixed(1);

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartMeta}>
        Range: {toHours(minM)}h – {toHours(maxM)}h
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Line chart of 7-day sleep duration, range ${toHours(minM)} to ${toHours(maxM)} hours`}
        className={styles.chart}
      >
        {[minM, Math.round((minM + maxM) / 2), maxM].map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={scaleY(v, minM, maxM) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            className={styles.chartAxisLabel}
          >
            {toHours(v)}h
          </text>
        ))}
        {points.map((p, i) => {
          const x = scaleX(i, points.length);
          return (
            <text
              key={p.date}
              x={x}
              y={CHART_H - 4}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className={styles.chartAxisLabel}
            >
              {dayLabel(p.date)}
            </text>
          );
        })}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
        <path d={d} fill="none" stroke="var(--color-accent, #2563eb)" strokeWidth="2" strokeLinejoin="round" />
        <circle
          cx={scaleX(points.length - 1, points.length)}
          cy={scaleY(points[points.length - 1]!.minutes, minM, maxM)}
          r="4"
          fill="var(--color-accent, #2563eb)"
        />
      </svg>
    </div>
  );
}

// ── Weight line chart ─────────────────────────────────────────────────────────

interface WeightChartProps {
  points: WeightDayPoint[];
}

function WeightChart({ points }: WeightChartProps) {
  if (points.length < 2) {
    return (
      <div className={styles.chartEmpty} aria-label="7-Day Weight Trend">
        <p>Not enough weight data this week yet — data will appear once your smart scale syncs for at least two days.</p>
      </div>
    );
  }

  const kgs = points.map((p) => p.kg);
  const minKg = Math.min(...kgs);
  const maxKg = Math.max(...kgs);

  const pathPoints = points.map((p, i) => {
    const x = scaleX(i, points.length);
    const y = scaleY(p.kg, minKg, maxKg);
    return `${x},${y}`;
  });
  const d = `M ${pathPoints.join(" L ")}`;

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.chartMeta}>
        Range: {minKg} – {maxKg} kg
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Line chart of 7-day weight trend, range ${minKg} to ${maxKg} kg`}
        className={styles.chart}
      >
        {[minKg, Math.round(((minKg + maxKg) / 2) * 10) / 10, maxKg].map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={scaleY(v, minKg, maxKg) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            className={styles.chartAxisLabel}
          >
            {v}
          </text>
        ))}
        {points.map((p, i) => {
          const x = scaleX(i, points.length);
          return (
            <text
              key={p.date}
              x={x}
              y={CHART_H - 4}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className={styles.chartAxisLabel}
            >
              {dayLabel(p.date)}
            </text>
          );
        })}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
        <path d={d} fill="none" stroke="var(--color-accent, #2563eb)" strokeWidth="2" strokeLinejoin="round" />
        <circle
          cx={scaleX(points.length - 1, points.length)}
          cy={scaleY(points[points.length - 1]!.kg, minKg, maxKg)}
          r="4"
          fill="var(--color-accent, #2563eb)"
        />
      </svg>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState<string | null>(null);

  const [counts, setCounts] = useState<GoalCounts>({ onTrack: 0, atRisk: 0, missed: 0 });
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  const fetchDashboard = useCallback((signal?: AbortSignal) => {
    setDashLoading(true);
    setDashError(null);
    apiFetch<{ data: DashboardPayload }>("/dashboard", signal ? { signal } : {})
      .then((res) => {
        setDashboard(res.data);
        setDashLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setDashError("Failed to load dashboard data.");
        setDashLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchDashboard]);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<{ data: { goals: GoalSummary[] } }>("/goals", { signal: controller.signal })
      .then((res) => {
        setCounts(computeCounts(res.data.goals));
        setGoalsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setGoalsError("Failed to load goals.");
        setGoalsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  const lastSyncLabel =
    dashboard?.lastSyncStatus.overallLastSyncAt
      ? `✓ Last synced: ${relativeTime(dashboard.lastSyncStatus.overallLastSyncAt)}`
      : dashboard?.lastSyncStatus.stalenessLabel ?? "✓ Last synced: —";

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        {dashLoading ? (
          <h1 className={styles.greetingSkeleton} aria-busy="true">
            Loading…
          </h1>
        ) : dashError ? (
          <>
            <h1>Dashboard</h1>
            <p role="alert" className={styles.dashError}>
              {dashError}{" "}
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => fetchDashboard()}
              >
                Retry
              </button>
            </p>
          </>
        ) : (
          <h1>{dashboard!.greeting}</h1>
        )}
        <span className={styles.syncStatus}>
          {lastSyncLabel}{" "}
          <button
            type="button"
            className={styles.refreshLink}
            onClick={() => fetchDashboard()}
            aria-label="Refresh dashboard"
          >
            ↻ Refresh
          </button>
        </span>
      </div>

      <section aria-labelledby="metrics-heading" className={styles.metricsSection}>
        <h2 id="metrics-heading" className="sr-only">Health Metrics</h2>
        {dashLoading ? (
          <ul className={styles.metricCards} aria-label="Health metrics">
            {(["HeartRate", "Steps", "BloodPressure", "Sleep"] as CardId[]).map((id) => (
              <li key={id} className={styles.metricCard} aria-busy="true">
                <span className={styles.metricLabel}>Loading…</span>
              </li>
            ))}
          </ul>
        ) : dashError ? null : (
          <ul className={styles.metricCards} aria-label="Health metrics">
            {dashboard!.summaryCards.map((card) => (
              <MetricCard key={card.id} card={card} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="trends-heading" className={styles.trendsSection}>
        <h2 id="trends-heading">Trends</h2>
        <div className={styles.trendsGrid}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>{"Today's Heart Rate Fluctuations"}</h3>
            {dashLoading ? (
              <div className={styles.chartEmpty} aria-busy="true">Loading…</div>
            ) : dashError ? null : (
              <HeartRateChart points={dashboard!.trends?.heartRateToday ?? []} />
            )}
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>{"This Week's Step Activity"}</h3>
            {dashLoading ? (
              <div className={styles.chartEmpty} aria-busy="true">Loading…</div>
            ) : dashError ? null : (
              <StepsChart
                points={dashboard!.trends?.steps7d ?? []}
                goal={dashboard!.trends?.stepsGoal ?? null}
              />
            )}
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>7-Day Sleep Duration</h3>
            {dashLoading ? (
              <div className={styles.chartEmpty} aria-busy="true">Loading…</div>
            ) : dashError ? null : (
              <SleepChart points={dashboard!.trends?.sleepMinutes7d ?? []} />
            )}
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>7-Day Weight Trend</h3>
            {dashLoading ? (
              <div className={styles.chartEmpty} aria-busy="true">Loading…</div>
            ) : dashError ? null : (
              <WeightChart points={dashboard!.trends?.weight7d ?? []} />
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="insights-heading" className={styles.infoGrid}>
        <div>
          <h2 id="insights-heading">Insights</h2>
          <ul className={styles.insightList}>
            <li className={styles.insightItem}>
              <span aria-hidden="true">💡</span>
              <div>
                <strong>Sleep Improvement</strong>
                <p>Your sleep average improved by 32 minutes compared with last week. Keep up the consistent bedtime routine!</p>
              </div>
            </li>
            <li className={styles.insightItem}>
              <span aria-hidden="true">🎯</span>
              <div>
                <strong>Activity Streak</strong>
                <p>{"You've hit your step goal 5 days in a row. Just 2 more days for a full week!"}</p>
              </div>
            </li>
          </ul>
        </div>

        <div>
          <h2>Alerts</h2>
          <ul className={styles.alertList}>
            <li className={styles.alertItem}>
              <span aria-hidden="true">⚠️</span>
              <div>
                <strong>Stale Data</strong>
                <p>Scale data last synced 18 hours ago. Reconnect if no new reading appears today.</p>
                <Link to="/devices" className={styles.detailsLink}>View Details</Link>
              </div>
            </li>
            <li className={styles.alertItem}>
              <span aria-hidden="true">🔴</span>
              <div>
                <strong>Goal At Risk</strong>
                <p>{"You're 2,500 steps behind your daily goal. A 20-minute walk can get you back on track."}</p>
                <Link to="/goals" className={styles.detailsLink}>View Details</Link>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="goals-summary-heading" className={styles.goalsSection}>
        <h2 id="goals-summary-heading">Goals</h2>
        {goalsError ? (
          <p role="alert" className={styles.goalsError}>
            {goalsError}{" "}
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                setGoalsError(null);
                setGoalsLoading(true);
                apiFetch<{ data: { goals: GoalSummary[] } }>("/goals")
                  .then((res) => {
                    setCounts(computeCounts(res.data.goals));
                    setGoalsLoading(false);
                  })
                  .catch(() => {
                    setGoalsError("Failed to load goals.");
                    setGoalsLoading(false);
                  });
              }}
            >
              Retry
            </button>
          </p>
        ) : (
          <ul className={styles.goalCountList} aria-label="Goals summary" aria-busy={goalsLoading}>
            <li className={styles.goalCountItem}>
              <strong className={styles.goalCountValue}>{goalsLoading ? "—" : counts.onTrack}</strong>
              <span>On track</span>
            </li>
            <li className={styles.goalCountItem}>
              <strong className={styles.goalCountValue}>{goalsLoading ? "—" : counts.atRisk}</strong>
              <span>At risk</span>
            </li>
            <li className={styles.goalCountItem}>
              <strong className={styles.goalCountValue}>{goalsLoading ? "—" : counts.missed}</strong>
              <span>Missed</span>
            </li>
          </ul>
        )}
        <Link to="/goals" className={styles.viewAllLink}>View All Goals →</Link>
      </section>
    </div>
  );
}

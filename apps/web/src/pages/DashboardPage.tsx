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
  connectionStatus: string;
  lastSyncAt: string | null;
  stale: boolean;
}

interface LastSyncStatus {
  overallLastSyncAt: string | null;
  stalenessLabel: string;
  deviceStatuses: DeviceSyncStatus[];
}

interface GoalSummary {
  id: string;
  status: string;
}

interface DashboardPayload {
  greeting: string;
  personaMode: string;
  summaryCards: SummaryCard[];
  lastSyncStatus: LastSyncStatus;
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

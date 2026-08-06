import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./AlertsPage.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardInsight {
  category: string;
  title: string;
  narrative: string;
  icon: string;
}

interface DashboardPayload {
  insights?: DashboardInsight[];
  insights_starter_state?: boolean;
}

interface Recommendation {
  id: string;
  content: string;
  status: string;
}

// ── Insight category config ───────────────────────────────────────────────────

type InsightCategory =
  | "SleepQualityImproved"
  | "ActivityStreak"
  | "HeartRateVariability"
  | "BodyCompositionTrend";

interface InsightSlot {
  category: InsightCategory;
  defaultTitle: string;
  defaultIcon: string;
  linkLabel: string;
  linkTo: string;
}

const INSIGHT_SLOTS: InsightSlot[] = [
  {
    category: "SleepQualityImproved",
    defaultTitle: "Sleep Quality Improved",
    defaultIcon: "💡",
    linkLabel: "Learn More →",
    linkTo: "/goals",
  },
  {
    category: "ActivityStreak",
    defaultTitle: "Activity Streak",
    defaultIcon: "📈",
    linkLabel: "View Progress →",
    linkTo: "/goals",
  },
  {
    category: "HeartRateVariability",
    defaultTitle: "Heart Rate Variability",
    defaultIcon: "❤️",
    linkLabel: "Learn More →",
    linkTo: "/goals",
  },
  {
    category: "BodyCompositionTrend",
    defaultTitle: "Body Composition Trend",
    defaultIcon: "⚖️",
    linkLabel: "View Trends →",
    linkTo: "/goals",
  },
];

// ── Sub-component ─────────────────────────────────────────────────────────────

interface InsightCardProps {
  slot: InsightSlot;
  insight: DashboardInsight | undefined;
}

function InsightCard({ slot, insight }: InsightCardProps) {
  if (!insight) {
    return (
      <div className={styles.insightCard} data-category={slot.category}>
        <span aria-hidden="true">{slot.defaultIcon}</span>
        <div>
          <h3>{slot.defaultTitle}</h3>
          <p className={styles.starterState}>
            Sync your devices to unlock this insight.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.insightCard} data-category={slot.category}>
      <span aria-hidden="true">{insight.icon}</span>
      <div>
        <h3>{insight.title}</h3>
        <p>{insight.narrative}</p>
        <Link to={slot.linkTo} className={styles.insightLink}>
          {slot.linkLabel}
        </Link>
      </div>
    </div>
  );
}

// ── Static Health Alert cards ─────────────────────────────────────────────────

interface HealthAlertData {
  id: string;
  icon: string;
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  ago: string;
}

const STATIC_ALERTS: HealthAlertData[] = [
  {
    id: "no-data-3-days",
    icon: "🔴",
    severity: "high",
    title: "No data synced in 3 days",
    body: "Your Apple Watch hasn't synced data in 3 days. Please reconnect your device to ensure your health data stays up to date and accurate.",
    ago: "2 hours ago",
  },
  {
    id: "abnormal-heart-rate",
    icon: "⚠️",
    severity: "medium",
    title: "Abnormal resting heart rate detected",
    body: "Your resting heart rate has been consistently higher than your baseline (78 bpm vs. usual 64 bpm) for the past 3 days. Consider reviewing your stress levels and sleep quality.",
    ago: "5 hours ago",
  },
  {
    id: "goal-at-risk",
    icon: "⚠️",
    severity: "medium",
    title: "Goal at risk: Daily steps",
    body: "You're 2,500 steps behind your daily goal of 10,000 steps. A 20-minute walk can help you get back on track before the day ends.",
    ago: "1 hour ago",
  },
  {
    id: "scale-stale",
    icon: "ℹ️",
    severity: "low",
    title: "Scale data last synced 18 hours ago",
    body: "Your smart scale hasn't synced new data in 18 hours. If you've weighed yourself recently, try reconnecting your scale to update your body composition metrics.",
    ago: "18 hours ago",
  },
];

function HealthAlertCard({ alert }: { alert: HealthAlertData }) {
  return (
    <div className={styles.alertCard} data-alert-id={alert.id}>
      <div className={styles.alertCardHeader}>
        <span aria-hidden="true" className={styles.alertIcon}>{alert.icon}</span>
        <div className={styles.alertCardMeta}>
          <h3 className={styles.alertCardTitle}>{alert.title}</h3>
          <span className={`${styles.alertSeverity} ${styles[`severity-${alert.severity}`]}`}>
            {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
          </span>
        </div>
      </div>
      <p className={styles.alertCardBody}>{alert.body}</p>
      <p className={styles.alertCardAgo}>🕐 {alert.ago}</p>
      <div className={styles.alertCardActions}>
        <button type="button" className={styles.alertActionButton}>View Details</button>
        <button type="button" className={styles.alertActionButton}>Acknowledge</button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [starterState, setStarterState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<{ data: DashboardPayload }>("/dashboard", { signal: controller.signal })
      .then((res) => {
        const payload = res.data;
        setInsights(payload.insights ?? []);
        setStarterState(payload.insights_starter_state ?? !payload.insights?.length);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Failed to load insights. Please try again.");
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<{ data: Recommendation[] }>("/recommendations", { signal: controller.signal })
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        setRecs(items.filter((r) => r.status === "active"));
        setRecsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setRecs([]);
        setRecsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  const isStarterState = starterState || insights.length === 0;

  function retry() {
    setError(null);
    setLoading(true);
    apiFetch<{ data: DashboardPayload }>("/dashboard")
      .then((res) => {
        const payload = res.data;
        setInsights(payload.insights ?? []);
        setStarterState(payload.insights_starter_state ?? !payload.insights?.length);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load insights. Please try again.");
        setLoading(false);
      });
  }

  function fetchRecs() {
    apiFetch<{ data: Recommendation[] }>("/recommendations")
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        setRecs(items.filter((r) => r.status === "active"));
      })
      .catch(() => {
        setRecs([]);
      });
  }

  function handleMarkDone(id: string) {
    apiFetch<{ data: Recommendation }>(`/recommendations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    })
      .then(() => fetchRecs())
      .catch(() => {});
  }

  function handleDismiss(id: string) {
    setRecs((prev) => prev.filter((r) => r.id !== id));
    apiFetch<{ data: Recommendation }>(`/recommendations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "dismissed" }),
    }).catch(() => {});
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Alerts &amp; Insights</h1>
        <p className={styles.subtitle}>
          Stay informed about your health status and get personalized recommendations
        </p>
      </div>

      <section aria-labelledby="health-alerts-heading" className={styles.section}>
        <h2 id="health-alerts-heading">Health Alerts</h2>
        <div className={styles.alertGrid}>
          {STATIC_ALERTS.map((alert) => (
            <HealthAlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      </section>

      <section aria-labelledby="health-insights-heading" className={styles.section}>
        <h2 id="health-insights-heading">Health Insights</h2>

        {loading ? (
          <p className={styles.loadingState} aria-busy="true">
            Loading insights…
          </p>
        ) : error ? (
          <p role="alert" className={styles.errorState}>
            {error}{" "}
            <button type="button" className={styles.retryButton} onClick={retry}>
              Retry
            </button>
          </p>
        ) : (
          <div className={styles.insightGrid}>
            {INSIGHT_SLOTS.map((slot) => {
              const insight = isStarterState
                ? undefined
                : insights.find((i) => i.category === slot.category);
              return (
                <InsightCard key={slot.category} slot={slot} insight={insight} />
              );
            })}
          </div>
        )}
      </section>

      {!recsLoading && recs.length > 0 && (
        <section aria-labelledby="personalized-recs-heading" className={styles.section}>
          <h2 id="personalized-recs-heading">Personalized Recommendations</h2>
          <div className={styles.recGrid}>
            {recs.map((rec) => (
              <div key={rec.id} className={styles.recCard} data-rec-id={rec.id}>
                <p className={styles.recContent}>{rec.content}</p>
                <div className={styles.recActions}>
                  <button
                    type="button"
                    className={styles.recButton}
                    onClick={() => handleMarkDone(rec.id)}
                  >
                    Mark as Done
                  </button>
                  <button
                    type="button"
                    className={styles.recButton}
                    onClick={() => handleDismiss(rec.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

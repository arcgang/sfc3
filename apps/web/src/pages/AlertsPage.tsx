import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./AlertsPage.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiAlert {
  id: number;
  userId: string;
  category: string;
  priority: "high" | "medium" | "low";
  message: string;
  ruleKey: string | null;
  entityId: string | null;
  entityType: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

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

interface NudgeActionResult {
  dismissed: Recommendation;
  next_nudge: Recommendation | null;
}

// ── Alert helpers ─────────────────────────────────────────────────────────────

function priorityIcon(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "🔴";
  if (priority === "medium") return "⚠️";
  return "ℹ️";
}

function relativeTimeFromIso(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

// ── Fallback sample alerts used when API fails or returns empty ───────────────

interface FallbackAlert {
  id: string;
  priority: "high" | "medium" | "low";
  message: string;
}

const FALLBACK_ALERTS: FallbackAlert[] = [
  { id: "fallback-high", priority: "high", message: "No data synced in 3 days" },
  { id: "fallback-medium-hr", priority: "medium", message: "Abnormal resting heart rate detected" },
  { id: "fallback-medium-steps", priority: "medium", message: "Goal at risk: Daily steps" },
  { id: "fallback-low", priority: "low", message: "Scale data last synced 18 hours ago" },
];

// ── Health Alert card ─────────────────────────────────────────────────────────

interface HealthAlertCardProps {
  id: string | number;
  priority: "high" | "medium" | "low";
  message: string;
  ago: string;
  onAcknowledge?: (() => void) | null;
}

function HealthAlertCard({ id, priority, message, ago, onAcknowledge }: HealthAlertCardProps) {
  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
  return (
    <div className={styles.alertCard} data-alert-id={String(id)}>
      <div className={styles.alertCardHeader}>
        <span aria-hidden="true" className={styles.alertIcon}>{priorityIcon(priority)}</span>
        <div className={styles.alertCardMeta}>
          <h3 className={styles.alertCardTitle}>{message}</h3>
          <span className={`${styles.alertSeverity} ${styles[`severity-${priority}`]}`}>
            {priorityLabel}
          </span>
        </div>
      </div>
      <p className={styles.alertCardAgo}>🕐 {ago}</p>
      <div className={styles.alertCardActions}>
        <button type="button" className={styles.alertActionButton}>View Details</button>
        <button
          type="button"
          className={styles.alertActionButton}
          onClick={onAcknowledge ?? undefined}
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
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

// ── Insight sub-component ─────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const [apiAlerts, setApiAlerts] = useState<ApiAlert[] | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [starterState, setStarterState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<{ data: ApiAlert[] }>("/alerts", { signal: controller.signal })
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        setApiAlerts(items);
        setAlertsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setApiAlerts(null);
        setAlertsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

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

    apiFetch<{ data: Recommendation[] }>("/recommendations/nudges", { signal: controller.signal })
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

  function retryInsights() {
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

  function handleAcknowledge(id: number) {
    setApiAlerts((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    apiFetch<null>(`/alerts/${id}/acknowledge`, { method: "PATCH" }).catch(() => {
      // Optimistic removal stands; no rollback on failure
    });
  }

  function applyNudgeResult(id: string, result: NudgeActionResult) {
    setRecs((prev) => {
      const without = prev.filter((r) => r.id !== id);
      if (result.next_nudge && result.next_nudge.status === "active" && !without.some((r) => r.id === result.next_nudge!.id)) {
        return [...without, result.next_nudge].slice(0, 3);
      }
      return without;
    });
  }

  function handleMarkDone(id: string) {
    apiFetch<{ data: NudgeActionResult }>(`/recommendations/nudges/${id}/mark-done`, {
      method: "POST",
    })
      .then((res) => applyNudgeResult(id, res.data))
      .catch(() => {
        setRecs((prev) => prev.filter((r) => r.id !== id));
      });
  }

  function handleDismiss(id: string) {
    setRecs((prev) => prev.filter((r) => r.id !== id));
    apiFetch<{ data: NudgeActionResult }>(`/recommendations/nudges/${id}/dismiss`, {
      method: "POST",
    })
      .then((res) => {
        if (res.data.next_nudge && res.data.next_nudge.status === "active") {
          setRecs((prev) => {
            if (prev.some((r) => r.id === res.data.next_nudge!.id)) return prev;
            return [...prev, res.data.next_nudge!].slice(0, 3);
          });
        }
      })
      .catch(() => {});
  }

  const useFallback = !alertsLoading && (apiAlerts === null || apiAlerts.length === 0);

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

        {alertsLoading ? (
          <p className={styles.loadingState} aria-busy="true">
            Loading alerts…
          </p>
        ) : useFallback ? (
          <div className={styles.alertGrid}>
            {FALLBACK_ALERTS.map((alert) => (
              <HealthAlertCard
                key={alert.id}
                id={alert.id}
                priority={alert.priority}
                message={alert.message}
                ago="—"
                onAcknowledge={null}
              />
            ))}
          </div>
        ) : (
          <div className={styles.alertGrid}>
            {(apiAlerts ?? []).map((alert) => (
              <HealthAlertCard
                key={alert.id}
                id={alert.id}
                priority={alert.priority}
                message={alert.message}
                ago={relativeTimeFromIso(alert.createdAt)}
                onAcknowledge={() => handleAcknowledge(alert.id)}
              />
            ))}
          </div>
        )}
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
            <button type="button" className={styles.retryButton} onClick={retryInsights}>
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

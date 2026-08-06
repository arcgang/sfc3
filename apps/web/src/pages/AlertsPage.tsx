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

// ── Page ──────────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [starterState, setStarterState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Alerts &amp; Insights</h1>
        <p className={styles.subtitle}>
          Stay informed about your health status and get personalized recommendations
        </p>
      </div>

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
    </div>
  );
}

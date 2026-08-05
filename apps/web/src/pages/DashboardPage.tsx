import { Link } from "react-router-dom";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Good morning, Michael!</h1>
        <span className={styles.syncStatus}>
          ✓ Last synced: 2 hours ago{" "}
          <a href="#refresh-noop" onClick={(e) => e.preventDefault()} className={styles.refreshLink}>
            ↻ Refresh
          </a>
        </span>
      </div>

      <section aria-labelledby="metrics-heading" className={styles.metricsSection}>
        <h2 id="metrics-heading" className="sr-only">Health Metrics</h2>
        <ul className={styles.metricCards}>
          <li className={styles.metricCard}>
            <span className={styles.metricLabel}>Heart Rate ❤️</span>
            <strong className={styles.metricValue}>103 BPM</strong>
            <span className={styles.metricStatus}>⚠️ Monitor</span>
          </li>
          <li className={styles.metricCard}>
            <span className={styles.metricLabel}>Steps 🚶</span>
            <strong className={styles.metricValue}>2,097</strong>
            <span className={styles.metricStatus}>↑ 21% of goal</span>
          </li>
          <li className={styles.metricCard}>
            <span className={styles.metricLabel}>Blood Pressure 🩺</span>
            <strong className={styles.metricValue}>109/85</strong>
            <span className={styles.metricStatus}>⚠️ Elevated</span>
          </li>
          <li className={styles.metricCard}>
            <span className={styles.metricLabel}>Sleep 😴</span>
            <strong className={styles.metricValue}>9.5h</strong>
            <span className={styles.metricStatus}>→ Fair</span>
          </li>
        </ul>
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
        <ul className={styles.goalCountList}>
          <li className={styles.goalCountItem}>
            <strong className={styles.goalCountValue}>2</strong>
            <span>On track</span>
          </li>
          <li className={styles.goalCountItem}>
            <strong className={styles.goalCountValue}>1</strong>
            <span>At risk</span>
          </li>
          <li className={styles.goalCountItem}>
            <strong className={styles.goalCountValue}>0</strong>
            <span>Missed</span>
          </li>
        </ul>
        <Link to="/goals" className={styles.viewAllLink}>View All Goals →</Link>
      </section>
    </div>
  );
}

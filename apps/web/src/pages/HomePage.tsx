import { Link } from "react-router-dom";
import styles from "./HomePage.module.css";

/*
 * Preconnect placeholder:
 * Add <link rel="preconnect" href="..."> in index.html (or the root layout)
 * if an external resource (font CDN, API host) is ever introduced here,
 * to avoid render-blocking network round-trips on first paint.
 */

const HEALTH_DOMAINS = [
  {
    id: "activity",
    emoji: "🏃",
    title: "Activity",
    description:
      "Track your daily steps, active minutes, calories burned, and workout patterns to stay motivated and reach your fitness goals.",
  },
  {
    id: "sleep",
    emoji: "😴",
    title: "Sleep",
    description:
      "Monitor sleep duration, quality, and consistency to understand your rest patterns and improve recovery.",
  },
  {
    id: "vital-metrics",
    emoji: "❤️",
    title: "Vital Metrics",
    description:
      "Keep an eye on heart rate, resting heart rate, blood pressure, and other vital signs for complete health awareness.",
  },
  {
    id: "body-composition",
    emoji: "⚖️",
    title: "Body Composition",
    description:
      "Track weight, body fat percentage, muscle mass, and other composition metrics to understand your body changes over time.",
  },
] as const;

const STATS = [
  { id: "domains", value: "4", label: "Core health domains monitored" },
  { id: "unified", value: "1", label: "Unified dashboard replacing multiple apps" },
  { id: "sync", value: "Daily", label: "Near-daily synchronization visibility" },
  { id: "privacy", value: "100%", label: "Privacy-first handling of your data" },
] as const;

const TRUST_CARDS = [
  {
    id: "own-data",
    emoji: "🔒",
    title: "You Own Your Data",
    description:
      "Your health information belongs to you. Export or delete it anytime.",
  },
  {
    id: "encrypted",
    emoji: "🛡️",
    title: "Encrypted & Secure",
    description:
      "All data is encrypted at rest and in transit with industry-standard security.",
  },
  {
    id: "never-sold",
    emoji: "🚫",
    title: "Never Sold",
    description:
      "We will never sell your personal health data to advertisers or third parties.",
  },
] as const;

export function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <span className={styles.logo} aria-label="WellnessHub home">
            <span aria-hidden="true" className={styles.logoIcon}>W</span>
            <span>WellnessHub</span>
          </span>
          <div className={styles.headerActions}>
            <Link to="/login" className={styles.btnSecondary}>Log In</Link>
            <Link to="/register" className={styles.btnPrimary}>Get Started</Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroContent}>
            {/* LCP element: this h1 is plain text with no images or web fonts; it renders from the first CSS paint with no external fetch. */}
            <h1 id="hero-heading" className={styles.heroHeading}>
              One place for your complete wellness picture.
            </h1>
            <p className={styles.heroSubtitle}>
              Connect your smartwatch and smart scale, see your health trends in
              one dashboard, and get simple guidance you can act on every day.
            </p>
            <div className={styles.heroCta}>
              <Link to="/register" className={styles.btnPrimary}>Get Started Free</Link>
              <Link to="/about" className={styles.btnSecondary}>Learn More</Link>
            </div>
          </div>
        </section>

        <section className={styles.domainsSection} aria-labelledby="domains-heading">
          <div className={styles.sectionContent}>
            <div className={styles.sectionHeader}>
              <h2 id="domains-heading">Everything you need to track your wellness</h2>
              <p>Four core health domains monitored in one unified dashboard</p>
            </div>
            <ul className={styles.domainGrid}>
              {HEALTH_DOMAINS.map((domain) => (
                <li key={domain.id} className={styles.domainCard}>
                  <span aria-hidden="true" className={styles.domainIcon}>
                    {domain.emoji}
                  </span>
                  <h3>{domain.title}</h3>
                  <p>{domain.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.statisticsSection} aria-labelledby="statistics-heading">
          <h2 id="statistics-heading" className="sr-only">Statistics</h2>
          <ul className={styles.statsGrid}>
            {STATS.map((stat) => (
              <li key={stat.id} className={styles.statItem}>
                <strong className={styles.statNumber}>{stat.value}</strong>
                <span className={styles.statLabel}>{stat.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.trustSection} aria-labelledby="trust-heading">
          <div className={styles.trustContent}>
            <h2 id="trust-heading">Your data, your control</h2>
            <p className={styles.trustIntro}>
              We never sell your health information to third parties. Your
              wellness data is encrypted, secure, and always under your control.
            </p>
            <ul className={styles.trustFeatures}>
              {TRUST_CARDS.map((card) => (
                <li key={card.id} className={styles.trustFeature}>
                  <span aria-hidden="true" className={styles.trustIcon}>
                    {card.emoji}
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

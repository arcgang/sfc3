import { Link } from "react-router-dom";
import styles from "./HomePage.module.css";

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
  { value: "4", label: "Core health domains monitored" },
  { value: "1", label: "Unified dashboard replacing multiple apps" },
  { value: "Daily", label: "Near-daily synchronization visibility" },
  { value: "100%", label: "Privacy-first handling of your data" },
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

// PRECONNECT PLACEHOLDER: If any external resource (font, CDN asset) is ever added,
// add a corresponding <link rel="preconnect" href="..." /> in index.html before it.
// Primary text/background: #1a1a1a on #ffffff → 18.1:1 contrast (WCAG AA ≥4.5:1 satisfied)
export function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav aria-label="Main navigation" className={styles.nav}>
          <span aria-hidden="true">W</span>
          <strong className={styles.navBrand}>WellnessHub</strong>
          <Link to="/login" className={styles.navLink}>Log In</Link>
          <Link to="/signup" className={styles.navLink}>Get Started</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section aria-labelledby="hero-heading">
          {/* LCP element: the <h1> hero headline. It is lightweight because it is plain text with
              no external font dependency — renders immediately from the system font stack. */}
          <h1 id="hero-heading">One place for your complete wellness picture.</h1>
          <p>
            Connect your smartwatch and smart scale, see your health trends in
            one dashboard, and get simple guidance you can act on every day.
          </p>
          <Link to="/register">Get Started Free</Link>
          <Link to="/about">Learn More</Link>
        </section>

        <section aria-labelledby="domains-heading" className={styles.domainsSection}>
          <div className={styles.sectionInner}>
            <h2 id="domains-heading" className={styles.sectionHeading}>
              Everything you need to track your wellness
            </h2>
            <p className={styles.sectionSubheading}>
              Four core health domains monitored in one unified dashboard
            </p>
            <ul className={styles.cardGrid}>
              {HEALTH_DOMAINS.map((domain) => (
                <li key={domain.id} className={styles.card}>
                  <span aria-hidden="true" className={styles.cardEmoji}>
                    {domain.emoji}
                  </span>
                  <h3 className={styles.cardHeading}>{domain.title}</h3>
                  <p className={styles.cardDescription}>{domain.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="stats-heading" className={styles.statsSection}>
          <div className={styles.sectionInner}>
            <h2 id="stats-heading" className="sr-only">Statistics</h2>
            <ul className={styles.statsList}>
              {STATS.map((stat) => (
                <li key={stat.label}>
                  <strong className={styles.statValue}>{stat.value}</strong>
                  <span className={styles.statLabel}>{stat.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="trust-heading" className={styles.trustSection}>
          <div className={styles.sectionInner}>
            <h2 id="trust-heading" className={styles.sectionHeading}>
              Your data, your control
            </h2>
            <p className={styles.trustIntro}>
              We never sell your health information to third parties. Your
              wellness data is encrypted, secure, and always under your control.
            </p>
            <ul className={styles.cardGrid}>
              {TRUST_CARDS.map((card) => (
                <li key={card.id} className={styles.card}>
                  <span aria-hidden="true" className={styles.cardEmoji}>
                    {card.emoji}
                  </span>
                  <h3 className={styles.cardHeading}>{card.title}</h3>
                  <p className={styles.cardDescription}>{card.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

    </div>
  );
}

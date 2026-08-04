import { Link } from "react-router-dom";

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

export function HomePage() {
  return (
    <>
      <header>
        <nav aria-label="Main navigation">
          <span aria-hidden="true">W</span>
          <strong>WellnessHub</strong>
          <Link to="/login">Log In</Link>
          <Link to="/signup">Get Started</Link>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-heading">
          <h1 id="hero-heading">One place for your complete wellness picture.</h1>
          <p>
            Connect your smartwatch and smart scale, see your health trends in
            one dashboard, and get simple guidance you can act on every day.
          </p>
          <Link to="/register">Get Started Free</Link>
          <Link to="/about">Learn More</Link>
        </section>

        <section aria-labelledby="domains-heading">
          <h2 id="domains-heading">Everything you need to track your wellness</h2>
          <p>Four core health domains monitored in one unified dashboard</p>
          <ul>
            {HEALTH_DOMAINS.map((domain) => (
              <li key={domain.id}>
                <span aria-hidden="true">{domain.emoji}</span>
                <h3>{domain.title}</h3>
                <p>{domain.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">Statistics</h2>
          <ul>
            {STATS.map((stat) => (
              <li key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="trust-heading">
          <h2 id="trust-heading">Your data, your control</h2>
          <p>
            We never sell your health information to third parties. Your
            wellness data is encrypted, secure, and always under your control.
          </p>
          <ul>
            {TRUST_CARDS.map((card) => (
              <li key={card.id}>
                <span aria-hidden="true">{card.emoji}</span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer>
        <span aria-hidden="true">W</span>
        <strong>WellnessHub</strong>
        <nav aria-label="Footer navigation">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </footer>
    </>
  );
}

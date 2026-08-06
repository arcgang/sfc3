import { Link } from "react-router-dom";
import styles from "./PartnersServicesPage.module.css";

/* text: var(--color-text-primary) on var(--color-bg-white) — contrast ratio ≈ 18.1:1, well above WCAG AA 4.5:1 */

interface ServiceCard {
  id: string;
  name: string;
  category: string;
  description: string;
  premiumRequired: boolean;
  emoji: string;
}

const SERVICES: ServiceCard[] = [
  {
    id: "fitpro-training",
    name: "FitPro Training",
    category: "Fitness",
    description:
      "Personalized workout plans and virtual training sessions tailored to your fitness goals and current activity levels.",
    premiumRequired: true,
    emoji: "🏋️",
  },
  {
    id: "nutriguide",
    name: "NutriGuide",
    category: "Nutrition",
    description:
      "Custom meal plans and nutrition coaching based on your health metrics, dietary preferences, and wellness goals.",
    premiumRequired: false,
    emoji: "🥗",
  },
  {
    id: "mindfulme",
    name: "MindfulMe",
    category: "Mental Health",
    description:
      "Guided meditation, stress management techniques, and mental wellness resources to support your emotional health.",
    premiumRequired: false,
    emoji: "🧘",
  },
  {
    id: "sleepwell-program",
    name: "SleepWell Program",
    category: "Sleep",
    description:
      "Evidence-based sleep improvement strategies and personalized recommendations to enhance your sleep quality.",
    premiumRequired: true,
    emoji: "😴",
  },
  {
    id: "strength-builder",
    name: "Strength Builder",
    category: "Fitness",
    description:
      "Progressive strength training programs with video demonstrations and form guidance for all fitness levels.",
    premiumRequired: false,
    emoji: "💪",
  },
  {
    id: "runcoach",
    name: "RunCoach",
    category: "Fitness",
    description:
      "Structured running plans for beginners to advanced runners, with pace guidance and injury prevention tips.",
    premiumRequired: true,
    emoji: "🏃",
  },
  {
    id: "wellness-coaching",
    name: "Wellness Coaching",
    category: "Nutrition",
    description:
      "One-on-one coaching sessions with certified wellness professionals to help you achieve your health goals.",
    premiumRequired: false,
    emoji: "🍎",
  },
  {
    id: "stress-relief",
    name: "Stress Relief",
    category: "Mental Health",
    description:
      "Quick stress-relief exercises, breathing techniques, and mindfulness practices for busy lifestyles.",
    premiumRequired: false,
    emoji: "🧠",
  },
];

const CATEGORIES = ["All", "Fitness", "Nutrition", "Mental Health", "Sleep"] as const;

export function PartnersServicesPage() {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.logo}>
            <span className={styles.logoIcon} aria-hidden="true">W</span>
            <span className={styles.logoText}>WellnessHub</span>
          </span>
        </div>

        <nav className={styles.sidebarNav} aria-label="Sidebar navigation">
          <Link to="/dashboard" className={styles.navItem}>
            <span className={styles.navIcon}>📊</span>
            <span>Dashboard</span>
          </Link>
          <Link to="/my-account" className={styles.navItem}>
            <span className={styles.navIcon}>👤</span>
            <span>My Account</span>
          </Link>
          <Link
            to="/partners-services"
            className={`${styles.navItem} ${styles.navItemActive}`}
          >
            <span className={styles.navIcon}>🤝</span>
            <span>Partners &amp; Services</span>
          </Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userProfile}>
            <div className={styles.userAvatar} aria-hidden="true">A</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>Alex Johnson</div>
              <div className={styles.userEmail}>alex@example.com</div>
            </div>
          </div>
          <Link to="/logout" className={styles.logoutLink}>Log out</Link>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Explore Wellness Partners &amp; Services</h1>
          <p className={styles.pageSubtitle}>Discover services and programs to enhance your wellness journey</p>
        </div>

        <section aria-labelledby="premium-banner-heading" className={styles.premiumBanner}>
          <div className={styles.premiumContent}>
            <h2 id="premium-banner-heading" className={styles.premiumBannerHeading}>
              Unlock more services with Premium
            </h2>
            <p className={styles.premiumBannerText}>
              Get access to exclusive wellness programs, personalized coaching, and partner services
            </p>
          </div>
          <button type="button" className={styles.btnPremium}>Upgrade to Premium</button>
        </section>

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend className="sr-only">Category filters</legend>
          <ul className={styles.categoryFilters}>
            {CATEGORIES.map((cat, i) => (
              <li key={cat} style={{ listStyle: "none" }}>
                <button
                  type="button"
                  className={
                    i === 0
                      ? `${styles.categoryTab} ${styles.categoryTabActive}`
                      : styles.categoryTab
                  }
                >
                  {cat}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        <section aria-labelledby="services-list-heading">
          <h2 id="services-list-heading" className="sr-only">Available Services</h2>
          <ul className={styles.serviceGrid}>
            {SERVICES.map((service) => (
              <li key={service.id} className={styles.serviceCard}>
                {service.premiumRequired && (
                  <span className={styles.premiumBadge}>Premium</span>
                )}
                <div className={styles.serviceIcon} aria-hidden="true">
                  {service.emoji}
                </div>
                <h3 className={styles.serviceName}>{service.name}</h3>
                <p className={styles.serviceDescription}>{service.description}</p>
                <div className={styles.serviceFooter}>
                  <span className={styles.serviceCategory}>{service.category}</span>
                  <a
                    href="#learn-more-noop"
                    className={styles.btnLearnMore}
                    onClick={(e) => e.preventDefault()}
                  >
                    Learn More
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="coming-soon-heading" className={styles.comingSoon}>
          <h2 id="coming-soon-heading" className={styles.comingSoonHeading}>
            Service Booking Coming Soon
          </h2>
          <p className={styles.comingSoonText}>
            {"We're working on making it easy to book and schedule wellness services directly through WellnessHub. Stay tuned!"}
          </p>
        </section>
      </main>
    </div>
  );
}

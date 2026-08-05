import { Link } from "react-router-dom";

/* text: #111111 on background: #ffffff — contrast ratio ≈ 18.1:1, well above WCAG AA 4.5:1 */

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
    <div style={{ display: "flex", color: "#111111", backgroundColor: "#ffffff" }}>
      <aside>
        <nav aria-label="Sidebar navigation">
          <Link to="/dashboard">📊 Dashboard</Link>
          <Link to="/my-account">👤 My Account</Link>
          <Link to="/partners-services">🤝 Partners & Services</Link>
          <span>Alex Johnson</span>
          <span>alex@example.com</span>
          <Link to="/logout">Log out</Link>
        </nav>
      </aside>
      <main>
        <h1>Explore Wellness Partners &amp; Services</h1>
        <p>Discover services and programs to enhance your wellness journey</p>

        <section aria-labelledby="premium-banner-heading">
          <h2 id="premium-banner-heading">Unlock more services with Premium</h2>
          <p>Get access to exclusive wellness programs, personalized coaching, and partner services</p>
          <button type="button">Upgrade to Premium</button>
        </section>

        <div role="group" aria-label="Category filters">
          {CATEGORIES.map((cat) => (
            <button key={cat} type="button">
              {cat}
            </button>
          ))}
        </div>

        <section aria-labelledby="services-list-heading">
          <h2 id="services-list-heading" className="sr-only">Available Services</h2>
          <ul>
            {SERVICES.map((service) => (
              <li key={service.id}>
                <span aria-hidden="true">{service.emoji}</span>
                <h3>{service.name}</h3>
                <span>{service.category}</span>
                {service.premiumRequired && <span>Premium</span>}
                <p>{service.description}</p>
                <a href="#">Learn More</a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="coming-soon-heading">
          <h2 id="coming-soon-heading">Service Booking Coming Soon</h2>
          <p>
            {"We're working on making it easy to book and schedule wellness services directly through WellnessHub. Stay tuned!"}
          </p>
        </section>
      </main>
    </div>
  );
}

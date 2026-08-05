/**
 * Acceptance tests for the "Browse Partners and Services discovery placeholder" story.
 *
 * These tests exercise ALL THREE merged tasks together through the App router —
 * the seam that no individual task's unit tests cover:
 *   - Backend: partner_services seeded with specific premium_required values
 *   - Frontend (nav): /partners-services route registered in App
 *   - Frontend (page): PartnersServicesPage renders within the authenticated shell
 *
 * Criterion numbers map to the story's acceptance criteria.
 */

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

// Precondition: confirm the route is wired up in App before any behavioural assertion.
// If this function throws, the routing task never landed.
function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/partners-services"]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Precondition ─────────────────────────────────────────────────────────────────────────

test("precondition: App mounts a route at /partners-services (routing task landed)", () => {
  renderViaApp();
  // The page-level h1 is the most reliable indicator the route is registered.
  expect(
    screen.queryByRole("heading", {
      name: "Explore Wellness Partners & Services",
      level: 1,
    }),
  ).not.toBeNull();
});

// ── AC1: sidebar '🤝 Partners & Services' link routes to the Partners & Services screen ──

test("AC1 — '🤝 Partners & Services' sidebar link is present on the page rendered via App at /partners-services", () => {
  renderViaApp();
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("AC1 — '🤝 Partners & Services' sidebar link href is /partners-services", () => {
  renderViaApp();
  const link = screen.getByRole("link", { name: "🤝 Partners & Services" });
  expect(link.getAttribute("href")).toBe("/partners-services");
});

// ── AC2: all 8 services rendered with name, category badge, description, Learn More ──────
//
// The eight services that must appear are the ones seeded in the backend migration
// 002_partner_services_seed.sql. We test through the App so the routing seam is exercised.

const ALL_EIGHT_SERVICES = [
  {
    name: "FitPro Training",
    category: "Fitness",
    descriptionFragment: /fitness|workout|training/i,
  },
  {
    name: "NutriGuide",
    category: "Nutrition",
    descriptionFragment: /nutrition|meal|macro/i,
  },
  {
    name: "MindfulMe",
    category: "Mental Health",
    descriptionFragment: /meditation|stress|mental/i,
  },
  {
    name: "SleepWell Program",
    category: "Sleep",
    descriptionFragment: /sleep/i,
  },
  {
    name: "Strength Builder",
    category: "Fitness",
    descriptionFragment: /strength/i,
  },
  {
    name: "RunCoach",
    category: "Fitness",
    descriptionFragment: /running|runner|run/i,
  },
  {
    name: "Wellness Coaching",
    category: "Nutrition",
    descriptionFragment: /coaching|wellness/i,
  },
  {
    name: "Stress Relief",
    category: "Mental Health",
    descriptionFragment: /stress|breathing/i,
  },
] as const;

test("AC2 — all 8 service card h3 headings are rendered", () => {
  renderViaApp();
  for (const svc of ALL_EIGHT_SERVICES) {
    screen.getByRole("heading", { name: svc.name, level: 3 });
  }
});

test.each(ALL_EIGHT_SERVICES)(
  "AC2 — $name card shows category badge '$category'",
  ({ name, category }) => {
    renderViaApp();
    const heading = screen.getByRole("heading", { name, level: 3 });
    const card = heading.closest("li");
    if (!card) throw new Error(`Expected ${name} card <li> to exist`);
    expect(card.textContent).toContain(category);
  },
);

test.each(ALL_EIGHT_SERVICES)(
  "AC2 — $name card contains a short description",
  ({ name, descriptionFragment }) => {
    renderViaApp();
    const heading = screen.getByRole("heading", { name, level: 3 });
    const card = heading.closest("li");
    if (!card) throw new Error(`Expected ${name} card <li> to exist`);
    expect(card.textContent).toMatch(descriptionFragment);
  },
);

test("AC2 — every service card has a 'Learn More' link (8 total)", () => {
  renderViaApp();
  expect(screen.getAllByRole("link", { name: "Learn More" })).toHaveLength(8);
});

// ── AC3: category filter buttons (All, Fitness, Nutrition, Mental Health, Sleep) ─────────

test("AC3 — all 5 category filter buttons are rendered: All, Fitness, Nutrition, Mental Health, Sleep", () => {
  renderViaApp();
  for (const cat of ["All", "Fitness", "Nutrition", "Mental Health", "Sleep"]) {
    screen.getByRole("button", { name: cat });
  }
});

test("AC3 — exactly 5 category filter buttons appear inside the 'Category filters' fieldset", () => {
  renderViaApp();
  const fieldset = screen.getByRole("group", { name: "Category filters" });
  expect(within(fieldset).getAllByRole("button")).toHaveLength(5);
});

// ── AC4: 'Unlock more services with Premium' banner; Upgrade to Premium does not initiate billing

test("AC4 — 'Unlock more services with Premium' banner heading is visible", () => {
  renderViaApp();
  screen.getByRole("heading", {
    name: "Unlock more services with Premium",
    level: 2,
  });
});

test("AC4 — 'Upgrade to Premium' CTA button is rendered in the banner", () => {
  renderViaApp();
  screen.getByRole("button", { name: "Upgrade to Premium" });
});

test("AC4 — clicking 'Upgrade to Premium' does not navigate away from the Partners & Services page", () => {
  renderViaApp();
  screen.getByRole("button", { name: "Upgrade to Premium" }).click();
  // Page heading still present — no billing navigation occurred
  screen.getByRole("heading", {
    name: "Explore Wellness Partners & Services",
    level: 1,
  });
});

test("AC4 — no payment or billing form is present on the page (no billing flow reachable)", () => {
  renderViaApp();
  expect(
    screen.queryByRole("form", { name: /payment|billing|checkout|subscribe/i }),
  ).toBeNull();
  expect(
    screen.queryByRole("textbox", { name: /card number|credit card/i }),
  ).toBeNull();
});

// ── AC5: premium badges match partner_services rows with premium_required = 1 ────────────
//
// The backend migration (002_partner_services_seed.sql) seeds these four rows with
// premium_required = 1:
//   NutriGuide, SleepWell Program, RunCoach, Stress Relief
//
// And these four with premium_required = 0:
//   FitPro Training, MindfulMe, Strength Builder, Wellness Coaching
//
// The frontend card for a service must show a "Premium" badge if and only if
// the corresponding DB row has premium_required = 1.
// NOTE: this seam test is expected to FAIL if the frontend's hardcoded data
// does not match the backend's seeded data.

const PREMIUM_PER_DB: readonly string[] = [
  "NutriGuide",
  "SleepWell Program",
  "RunCoach",
  "Stress Relief",
];

const NOT_PREMIUM_PER_DB: readonly string[] = [
  "FitPro Training",
  "MindfulMe",
  "Strength Builder",
  "Wellness Coaching",
];

test.each(PREMIUM_PER_DB)(
  "AC5 — %s card shows a 'Premium' badge (DB row has premium_required=1)",
  (name) => {
    renderViaApp();
    const heading = screen.getByRole("heading", { name, level: 3 });
    const card = heading.closest("li");
    if (!card) throw new Error(`Expected ${name} card <li> to exist`);
    expect(within(card).getByText("Premium")).toBeTruthy();
  },
);

test.each(NOT_PREMIUM_PER_DB)(
  "AC5 — %s card does NOT show a 'Premium' badge (DB row has premium_required=0)",
  (name) => {
    renderViaApp();
    const heading = screen.getByRole("heading", { name, level: 3 });
    const card = heading.closest("li");
    if (!card) throw new Error(`Expected ${name} card <li> to exist`);
    expect(within(card).queryByText("Premium")).toBeNull();
  },
);

test("AC5 — exactly 4 'Premium' badges are rendered, matching the 4 DB rows with premium_required=1", () => {
  renderViaApp();
  expect(screen.getAllByText("Premium")).toHaveLength(4);
});

// ── AC6: 'Service Booking Coming Soon' section; no booking flow reachable ─────────────────

test("AC6 — 'Service Booking Coming Soon' heading is rendered", () => {
  renderViaApp();
  screen.getByRole("heading", {
    name: "Service Booking Coming Soon",
    level: 2,
  });
});

test("AC6 — the coming-soon section contains deferred booking copy", () => {
  renderViaApp();
  screen.getByText(
    /working on making it easy to book and schedule wellness services/i,
  );
});

test("AC6 — no booking form is reachable from the screen", () => {
  renderViaApp();
  expect(
    screen.queryByRole("form", { name: /book|schedule|appointment/i }),
  ).toBeNull();
});

test("AC6 — no 'Book Now' or 'Schedule' button is present", () => {
  renderViaApp();
  expect(
    screen.queryByRole("button", { name: /book now|^schedule$|book appointment/i }),
  ).toBeNull();
});

// ── AC7: authenticated shell — sidebar, user header, and logout intact ────────────────────

test("AC7 — sidebar navigation landmark is present", () => {
  renderViaApp();
  screen.getByRole("navigation", { name: "Sidebar navigation" });
});

test("AC7 — sidebar contains '📊 Dashboard' link", () => {
  renderViaApp();
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("AC7 — sidebar contains '👤 My Account' link", () => {
  renderViaApp();
  screen.getByRole("link", { name: "👤 My Account" });
});

test("AC7 — user name 'Alex Johnson' is displayed in the shell", () => {
  renderViaApp();
  screen.getByText("Alex Johnson");
});

test("AC7 — user email 'alex@example.com' is displayed in the shell", () => {
  renderViaApp();
  screen.getByText("alex@example.com");
});

test("AC7 — 'Log out' link is present in the sidebar", () => {
  renderViaApp();
  screen.getByRole("link", { name: "Log out" });
});

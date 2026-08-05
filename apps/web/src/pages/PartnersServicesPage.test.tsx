import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { PartnersServicesPage } from "./PartnersServicesPage.js";

function renderPartnersServicesPage() {
  return render(
    <MemoryRouter>
      <PartnersServicesPage />
    </MemoryRouter>,
  );
}

function renderViaApp(path = "/partners-services") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Route registration ────────────────────────────────────────────────────────

test("/partners-services route renders the Partners & Services page heading", () => {
  renderViaApp("/partners-services");
  screen.getByRole("heading", {
    name: /Explore Wellness Partners & Services/i,
    level: 1,
  });
});

// ── Sidebar navigation ────────────────────────────────────────────────────────

test("Partners & Services page renders the '🤝 Partners & Services' sidebar nav link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("'🤝 Partners & Services' sidebar nav link points to /partners-services", () => {
  renderPartnersServicesPage();
  const link = screen.getByRole("link", { name: "🤝 Partners & Services" });
  expect(link.getAttribute("href")).toBe("/partners-services");
});

test("sidebar nav contains Dashboard link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("sidebar nav contains My Account link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "👤 My Account" });
});

// ── Page heading ──────────────────────────────────────────────────────────────

test("Partners & Services page renders a level-1 heading with the spec text", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", {
    name: "Explore Wellness Partners & Services",
    level: 1,
  });
});

// ── Premium banner ────────────────────────────────────────────────────────────

test("Premium banner heading 'Unlock more services with Premium' is visible", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", {
    name: "Unlock more services with Premium",
    level: 2,
  });
});

test("'Upgrade to Premium' CTA button is rendered in the premium banner", () => {
  renderPartnersServicesPage();
  screen.getByRole("button", { name: "Upgrade to Premium" });
});

test("clicking 'Upgrade to Premium' button does not navigate away", () => {
  renderPartnersServicesPage();
  const btn = screen.getByRole("button", { name: "Upgrade to Premium" });
  btn.click();
  // Still on the same page — heading still present
  screen.getByRole("heading", { name: "Explore Wellness Partners & Services", level: 1 });
});

// ── Category filter buttons ───────────────────────────────────────────────────

test("category filter button 'All' is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("button", { name: "All" });
});

test("category filter button 'Fitness' is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("button", { name: "Fitness" });
});

test("category filter button 'Nutrition' is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("button", { name: "Nutrition" });
});

test("category filter button 'Mental Health' is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("button", { name: "Mental Health" });
});

test("category filter button 'Sleep' is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("button", { name: "Sleep" });
});

// ── Service cards — names ─────────────────────────────────────────────────────

test("FitPro Training service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "FitPro Training", level: 3 });
});

test("NutriGuide service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "NutriGuide", level: 3 });
});

test("MindfulMe service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "MindfulMe", level: 3 });
});

test("SleepWell Program service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "SleepWell Program", level: 3 });
});

test("Strength Builder service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "Strength Builder", level: 3 });
});

test("RunCoach service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "RunCoach", level: 3 });
});

test("Wellness Coaching service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "Wellness Coaching", level: 3 });
});

test("Stress Relief service card heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "Stress Relief", level: 3 });
});

// ── Service cards — category badges ──────────────────────────────────────────

test("FitPro Training card shows 'Fitness' category badge", () => {
  renderPartnersServicesPage();
  const heading = screen.getByRole("heading", { name: "FitPro Training", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected FitPro Training card <li> to exist");
  expect(card.textContent).toContain("Fitness");
});

test("NutriGuide card shows 'Nutrition' category badge", () => {
  renderPartnersServicesPage();
  const heading = screen.getByRole("heading", { name: "NutriGuide", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected NutriGuide card <li> to exist");
  expect(card.textContent).toContain("Nutrition");
});

test("MindfulMe card shows 'Mental Health' category badge", () => {
  renderPartnersServicesPage();
  const heading = screen.getByRole("heading", { name: "MindfulMe", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected MindfulMe card <li> to exist");
  expect(card.textContent).toContain("Mental Health");
});

test("SleepWell Program card shows 'Sleep' category badge", () => {
  renderPartnersServicesPage();
  const heading = screen.getByRole("heading", { name: "SleepWell Program", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected SleepWell Program card <li> to exist");
  expect(card.textContent).toContain("Sleep");
});

// ── Service cards — descriptions ──────────────────────────────────────────────

test("FitPro Training card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Personalized workout plans and virtual training sessions tailored to your fitness goals/,
  );
});

test("NutriGuide card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Custom meal plans and nutrition coaching based on your health metrics/,
  );
});

test("MindfulMe card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Guided meditation, stress management techniques, and mental wellness resources/,
  );
});

test("SleepWell Program card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Evidence-based sleep improvement strategies and personalized recommendations/,
  );
});

test("Strength Builder card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Progressive strength training programs with video demonstrations/,
  );
});

test("RunCoach card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Structured running plans for beginners to advanced runners/,
  );
});

test("Wellness Coaching card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /One-on-one coaching sessions with certified wellness professionals/,
  );
});

test("Stress Relief card shows correct description", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /Quick stress-relief exercises, breathing techniques, and mindfulness practices/,
  );
});

// ── Service cards — Learn More links ─────────────────────────────────────────

test("each service card renders a 'Learn More' link (8 total)", () => {
  const { getAllByRole } = renderPartnersServicesPage();
  const learnMoreLinks = getAllByRole("link", { name: "Learn More" });
  expect(learnMoreLinks.length).toBe(8);
});

// ── Premium badges ────────────────────────────────────────────────────────────

test("premium badges are shown on premium services (FitPro Training, SleepWell Program, RunCoach)", () => {
  const { getAllByText } = renderPartnersServicesPage();
  // Design shows Premium badges on FitPro Training, SleepWell Program, RunCoach
  expect(getAllByText("Premium").length).toBe(3);
});

// ── Service Booking Coming Soon section ───────────────────────────────────────

test("'Service Booking Coming Soon' heading is rendered", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", { name: "Service Booking Coming Soon", level: 2 });
});

test("'Service Booking Coming Soon' section contains deferred booking copy", () => {
  renderPartnersServicesPage();
  screen.getByText(
    /working on making it easy to book and schedule wellness services directly through WellnessHub/i,
  );
});

// ── Log out link ──────────────────────────────────────────────────────────────

test("Partners & Services page renders 'Log out' link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "Log out" });
});

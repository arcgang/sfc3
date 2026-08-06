/**
 * Acceptance tests for "Restyle Alerts & Insights - WellnessHub to match the updated design".
 *
 * Story: As a user, I want the Alerts & Insights screen to match the updated design
 * so the UI stays consistent with the latest wireframe.
 *
 * These tests verify the seam between the two merged tasks:
 *   Task 1 (token audit/extension): src/styles/tokens.css declares all required design tokens
 *   Task 2 (restyling): src/pages/AlertsPage.module.css uses those tokens — not raw hex/px
 *
 * Nothing here duplicates AlertsPage.test.tsx (which covers page structure and interactions).
 * What no existing test covers: that the token variables exist AND that the module consumes them.
 *
 * Criterion labels map to the story's acceptance criteria.
 * Untestable criteria are listed at the bottom of this file.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, type MockedFunction, beforeEach, afterEach } from "vitest";
import { AlertsPage } from "./pages/AlertsPage.js";
import { Layout } from "./components/Layout.js";
import { AuthProvider } from "./context/AuthContext.js";
import * as apiModule from "./api.js";

// ── File paths ────────────────────────────────────────────────────────────────

// Absolute paths resolved from the project root — works in jsdom without import.meta.url
const SRC_DIR = resolve(process.cwd(), "src");
const TOKENS_CSS_PATH = resolve(SRC_DIR, "styles/tokens.css");
const MODULE_CSS_PATH = resolve(SRC_DIR, "pages/AlertsPage.module.css");
const MAIN_TSX_PATH = resolve(SRC_DIR, "main.tsx");

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("./api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockApiFetch = apiModule.apiFetch as MockedFunction<typeof apiModule.apiFetch>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FOUR_ALERTS = [
  { id: 1, userId: "u1", category: "sync_failure", priority: "high", message: "No data synced in 3 days", ruleKey: null, entityId: null, entityType: null, acknowledged: false, acknowledgedAt: null, createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: 2, userId: "u1", category: "abnormal_reading", priority: "medium", message: "Abnormal resting heart rate detected", ruleKey: null, entityId: null, entityType: null, acknowledged: false, acknowledgedAt: null, createdAt: new Date(Date.now() - 5 * 3600_000).toISOString() },
  { id: 3, userId: "u1", category: "goal_risk", priority: "medium", message: "Goal at risk: Daily steps", ruleKey: null, entityId: null, entityType: null, acknowledged: false, acknowledgedAt: null, createdAt: new Date(Date.now() - 1 * 3600_000).toISOString() },
  { id: 4, userId: "u1", category: "stale_data", priority: "low", message: "Scale data last synced 18 hours ago", ruleKey: null, entityId: null, entityType: null, acknowledged: false, acknowledgedAt: null, createdAt: new Date(Date.now() - 18 * 3600_000).toISOString() },
];

const FOUR_INSIGHTS = [
  { category: "SleepQualityImproved", title: "Sleep Quality Improved", narrative: "Sleep narrative.", icon: "💡" },
  { category: "ActivityStreak", title: "Activity Streak", narrative: "Activity narrative.", icon: "📈" },
  { category: "HeartRateVariability", title: "Heart Rate Variability", narrative: "HRV narrative.", icon: "❤️" },
  { category: "BodyCompositionTrend", title: "Body Composition Trend", narrative: "Body comp narrative.", icon: "⚖️" },
];

const DASHBOARD_RESPONSE = {
  data: {
    greeting: "Good morning!",
    personaMode: "default",
    summaryCards: [],
    lastSyncStatus: { overallLastSyncAt: "2026-08-06T10:00:00.000Z", isStale: false, staleThresholdHours: 18, stalenessLabel: "Up to date", deviceStatuses: [] },
    insights: FOUR_INSIGHTS,
  },
};

const THREE_RECS = [
  { id: "rec-1", insight_type: "nudge", content: "Walk recommendation.", status: "active", user_id: "u1", goal_id: null, generator_name: null, user_data_only: 1, created_at: "2026-08-06T00:00:00.000Z", updated_at: "2026-08-06T00:00:00.000Z" },
  { id: "rec-2", insight_type: "nudge", content: "Sleep recommendation.", status: "active", user_id: "u1", goal_id: null, generator_name: null, user_data_only: 1, created_at: "2026-08-06T00:00:00.000Z", updated_at: "2026-08-06T00:00:00.000Z" },
  { id: "rec-3", insight_type: "nudge", content: "Hydration recommendation.", status: "active", user_id: "u1", goal_id: null, generator_name: null, user_data_only: 1, created_at: "2026-08-06T00:00:00.000Z", updated_at: "2026-08-06T00:00:00.000Z" },
];

function renderAlertsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/alerts"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/alerts" element={<AlertsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve({ data: FOUR_ALERTS });
    if (path === "/dashboard") return Promise.resolve(DASHBOARD_RESPONSE);
    if (path === "/recommendations/nudges") return Promise.resolve({ data: THREE_RECS });
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Preconditions: source files must exist ────────────────────────────────────

test("precondition: src/styles/tokens.css exists (Task 1 output is present)", () => {
  let content: string;
  try {
    content = readFileSync(TOKENS_CSS_PATH, "utf-8");
  } catch {
    throw new Error(`tokens.css not found at ${TOKENS_CSS_PATH} — Task 1 (token audit) did not land`);
  }
  expect(content.length).toBeGreaterThan(0);
});

test("precondition: src/pages/AlertsPage.module.css exists (Task 2 output is present)", () => {
  let content: string;
  try {
    content = readFileSync(MODULE_CSS_PATH, "utf-8");
  } catch {
    throw new Error(`AlertsPage.module.css not found at ${MODULE_CSS_PATH} — Task 2 (restyling) did not land`);
  }
  expect(content.length).toBeGreaterThan(0);
});

test("precondition: tokens.css is imported in main.tsx so custom properties are available globally", () => {
  const main = readFileSync(MAIN_TSX_PATH, "utf-8");
  expect(main).toMatch(/import.*styles\/tokens\.css/);
});

// ── AC2: Color design tokens are defined in tokens.css ────────────────────────

const REQUIRED_COLOR_TOKENS = [
  "--color-teal-500",   // #14b8a6
  "--color-teal-600",   // #0d9488
  "--color-teal-50",    // #f0fdfa
  "--color-teal-100",   // #ccfbf1
  "--color-teal-800",   // #115e59
  "--color-teal-900",   // #065f46
  "--color-gray-500",   // #6b7280
  "--color-gray-800",   // #1f2937
  "--color-gray-200",   // #e5e7eb
  "--color-gray-50",    // #f9fafb
  "--color-gray-700",   // #374151
  "--color-white",      // #ffffff
  "--color-red-500",    // #ef4444
  "--color-red-50",     // #fef2f2
  "--color-red-100",    // #fee2e2
  "--color-red-800",    // #991b1b
  "--color-red-coral",  // #ff6b6b
  "--color-amber-50",   // #fffbeb
  "--color-amber-100",  // #fef3c7
  "--color-amber-800",  // #92400e
];

test.each(REQUIRED_COLOR_TOKENS)(
  "AC2: tokens.css defines color token %s",
  (token) => {
    const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
    expect(css).toContain(`${token}:`);
  },
);

// ── AC3: Font design token is defined in tokens.css ──────────────────────────

test("AC3: tokens.css defines --font-family-base containing 'Inter'", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--font-family-base");
  expect(css).toMatch(/--font-family-base\s*:.*Inter/);
});

test("AC3: tokens.css --font-family-base includes system fallback fonts", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  // Use dotAll flag (s) so . matches newlines — the declaration may span multiple lines
  expect(css).toMatch(/--font-family-base\s*:.*-apple-system/s);
  expect(css).toMatch(/--font-family-base\s*:.*sans-serif/s);
});

// ── AC4: Font-size design tokens are defined in tokens.css ───────────────────

const REQUIRED_FONT_SIZE_TOKENS = [
  "--font-size-11",
  "--font-size-12",
  "--font-size-13",
  "--font-size-14",
  "--font-size-15",
  "--font-size-16",
  "--font-size-18",
  "--font-size-20",
  "--font-size-24",
  "--font-size-28",
  "--font-size-32",
  "--font-size-40",
  "--font-size-48",
];

test.each(REQUIRED_FONT_SIZE_TOKENS)(
  "AC4: tokens.css defines font-size token %s",
  (token) => {
    const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
    expect(css).toContain(`${token}:`);
  },
);

// ── AC5: Spacing design tokens are defined in tokens.css ─────────────────────

const REQUIRED_SPACING_TOKENS = [
  ["--space-1", "4px"],
  ["--space-2", "6px"],
  ["--space-3", "8px"],
  ["--space-4", "10px"],
  ["--space-5", "12px"],
  ["--space-6", "14px"],
  ["--space-7", "16px"],
  ["--space-8", "20px"],
  ["--space-9", "24px"],
  ["--space-10", "32px"],
  ["--space-11", "40px"],
  ["--space-12", "48px"],
  ["--space-13", "64px"],
  ["--space-14", "80px"],
  ["--space-sidebar", "200px"],
  ["--space-sidebar-wide", "240px"],
];

test.each(REQUIRED_SPACING_TOKENS)(
  "AC5: tokens.css defines spacing token %s as %s",
  (token, value) => {
    const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
    expect(css).toContain(`${token}:`);
    expect(css).toMatch(new RegExp(`${token}\\s*:\\s*${value}`));
  },
);

// ── AC6: Border-radius design tokens are defined in tokens.css ───────────────

const REQUIRED_RADIUS_TOKENS = [
  ["--radius-1", "3px"],
  ["--radius-2", "4px"],
  ["--radius-3", "5px"],
  ["--radius-4", "6px"],
  ["--radius-5", "8px"],
  ["--radius-6", "12px"],
  ["--radius-7", "16px"],
  ["--radius-8", "20px"],
];

test.each(REQUIRED_RADIUS_TOKENS)(
  "AC6: tokens.css defines radius token %s as %s",
  (token, value) => {
    const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
    expect(css).toContain(`${token}:`);
    expect(css).toMatch(new RegExp(`${token}\\s*:\\s*${value}`));
  },
);

// ── AC7: Shadow design tokens are defined in tokens.css ──────────────────────

test("AC7: tokens.css defines --shadow-xs (0 1px 3px rgba(0,0,0,0.05))", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--shadow-xs");
  expect(css).toMatch(/--shadow-xs\s*:.*0 1px 3px/);
});

test("AC7: tokens.css defines --shadow-md (0 4px 24px rgba(0,0,0,0.08))", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--shadow-md");
  expect(css).toMatch(/--shadow-md\s*:.*0 4px 24px/);
});

test("AC7: tokens.css defines --shadow-sm (0 4px 16px rgba(0,0,0,0.08))", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--shadow-sm");
  expect(css).toMatch(/--shadow-sm\s*:.*0 4px 16px/);
});

test("AC7: tokens.css defines --shadow-focus-ring (0 0 0 3px rgba(20,184,166,0.1))", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--shadow-focus-ring");
  expect(css).toMatch(/--shadow-focus-ring\s*:.*0 0 0 3px/);
});

test("AC7: tokens.css defines --shadow-lg (0 4px 12px rgba(0,0,0,0.15))", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--shadow-lg");
  expect(css).toMatch(/--shadow-lg\s*:.*0 4px 12px/);
});

// ── AC8: Gradient design tokens are defined in tokens.css ────────────────────

test("AC8: tokens.css defines --gradient-teal-diagonal (135deg teal gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-teal-diagonal");
  expect(css).toMatch(/--gradient-teal-diagonal\s*:.*135deg/);
  expect(css).toMatch(/--gradient-teal-diagonal\s*:.*#14b8a6/i);
});

test("AC8: tokens.css defines --gradient-teal-light (135deg light teal gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-teal-light");
  expect(css).toMatch(/--gradient-teal-light\s*:.*135deg/);
  expect(css).toMatch(/--gradient-teal-light\s*:.*#f0fdfa/i);
});

test("AC8: tokens.css defines --gradient-teal-horizontal (90deg teal gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-teal-horizontal");
  expect(css).toMatch(/--gradient-teal-horizontal\s*:.*90deg/);
});

test("AC8: tokens.css defines --gradient-coral (135deg coral/red gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-coral");
  expect(css).toMatch(/--gradient-coral\s*:.*135deg/);
  expect(css).toMatch(/--gradient-coral\s*:.*#ff6b6b/i);
});

test("AC8: tokens.css defines --gradient-red-horizontal (to right red gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-red-horizontal");
  expect(css).toMatch(/--gradient-red-horizontal\s*:.*to right/);
});

test("AC8: tokens.css defines --gradient-blue-horizontal (to right blue gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-blue-horizontal");
  expect(css).toMatch(/--gradient-blue-horizontal\s*:.*to right/);
});

test("AC8: tokens.css defines --gradient-amber-horizontal (90deg amber gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-amber-horizontal");
  expect(css).toMatch(/--gradient-amber-horizontal\s*:.*90deg/);
  expect(css).toMatch(/--gradient-amber-horizontal\s*:.*#f59e0b/i);
});

test("AC8: tokens.css defines --gradient-red-solid (90deg red gradient)", () => {
  const css = readFileSync(TOKENS_CSS_PATH, "utf-8");
  expect(css).toContain("--gradient-red-solid");
  expect(css).toMatch(/--gradient-red-solid\s*:.*90deg/);
  expect(css).toMatch(/--gradient-red-solid\s*:.*#ef4444/i);
});

// ── AC9: Responsive breakpoints in AlertsPage.module.css ─────────────────────

test("AC9: AlertsPage.module.css has @media query at 480px (mobile-sm breakpoint)", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/@media\s*\([^)]*480px[^)]*\)/);
});

test("AC9: AlertsPage.module.css has @media query at 768px (tablet breakpoint)", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/@media\s*\([^)]*768px[^)]*\)/);
});

test("AC9: AlertsPage.module.css has @media query at 1024px (laptop breakpoint)", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/@media\s*\([^)]*1024px[^)]*\)/);
});

// ── Seam: AlertsPage.module.css uses design tokens — not raw values ───────────

test("seam: AlertsPage.module.css contains no raw hex color values (all colors via var(--color-))", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  // Strip comments before searching, so commented-out code doesn't trip the check
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const hexPattern = /#[0-9a-fA-F]{3,8}(?!\s*[0-9a-fA-F])/g;
  const hits = noComments.match(hexPattern) ?? [];
  expect(hits).toHaveLength(0);
});

test("seam: AlertsPage.module.css uses var(--color-...) for at least one color property", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/var\(--color-/);
});

test("seam: AlertsPage.module.css uses var(--font-family-base) for font-family declarations", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/font-family\s*:\s*var\(--font-family-base\)/);
});

test("seam: AlertsPage.module.css uses var(--font-size-...) for font-size declarations", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/font-size\s*:\s*var\(--font-size-/);
});

test("seam: AlertsPage.module.css uses var(--space-...) for spacing/padding/gap declarations", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/(?:padding|gap|margin)\s*:\s*var\(--space-/);
});

test("seam: AlertsPage.module.css uses var(--radius-...) for border-radius declarations", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/border-radius\s*:\s*var\(--radius-/);
});

test("seam: AlertsPage.module.css uses var(--shadow-...) for box-shadow declarations", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/box-shadow\s*:\s*var\(--shadow-/);
});

test("seam: AlertsPage.module.css uses var(--gradient-...) for gradient background declarations", () => {
  const css = readFileSync(MODULE_CSS_PATH, "utf-8");
  expect(css).toMatch(/background\s*:\s*var\(--gradient-/);
});

test("seam: every CSS custom property referenced in AlertsPage.module.css is defined in tokens.css", () => {
  const moduleCss = readFileSync(MODULE_CSS_PATH, "utf-8");
  const tokensCss = readFileSync(TOKENS_CSS_PATH, "utf-8");

  const varRefs = [...moduleCss.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
  const uniqueRefs = [...new Set(varRefs)];

  const undefined_tokens: string[] = [];
  for (const ref of uniqueRefs) {
    if (!tokensCss.includes(`${ref}:`)) {
      undefined_tokens.push(ref);
    }
  }
  expect(undefined_tokens).toHaveLength(0);
});

// ── Render-level seam: CSS data-attribute hooks are wired for severity coloring ──

test("seam (render): high-priority alert card has data-priority='high' for CSS selector hook", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("No data synced in 3 days").closest("[data-alert-id]");
  expect(card).not.toBeNull();
  expect((card as HTMLElement).getAttribute("data-priority")).toBe("high");
});

test("seam (render): medium-priority alert card has data-priority='medium' for CSS selector hook", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("Abnormal resting heart rate detected").closest("[data-alert-id]");
  expect(card).not.toBeNull();
  expect((card as HTMLElement).getAttribute("data-priority")).toBe("medium");
});

test("seam (render): low-priority alert card has data-priority='low' for CSS selector hook", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("Scale data last synced 18 hours ago").closest("[data-alert-id]");
  expect(card).not.toBeNull();
  expect((card as HTMLElement).getAttribute("data-priority")).toBe("low");
});

test("seam (render): insight icon box element has a CSS class applied (gradient token hook)", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Sleep Quality Improved", level: 3 });
  const section = screen.getByRole("region", { name: "Health Insights" });
  // The insight icon box (emoji container with teal gradient) must have a scoped CSS class
  const card = within(section)
    .getByRole("heading", { name: "Sleep Quality Improved", level: 3 })
    .closest("[data-category='SleepQualityImproved']");
  expect(card).not.toBeNull();
  // The icon box is the aria-hidden sibling before the h3 inside the header div
  const iconBox = (card as HTMLElement).querySelector("[aria-hidden='true']");
  expect(iconBox).not.toBeNull();
  expect((iconBox as HTMLElement).className.length).toBeGreaterThan(0);
});

test("seam (render): recommendation card has a CSS class applied (teal background token hook)", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  const card = within(section).getAllByRole("button", { name: "Mark as Done" })[0]!.closest("[data-rec-id]");
  expect(card).not.toBeNull();
  expect((card as HTMLElement).className.length).toBeGreaterThan(0);
});

test("seam (render): section cards have a CSS class applied (white background + shadow token hooks)", async () => {
  renderAlertsPage();
  const heading = await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = heading.closest("section");
  expect(section).not.toBeNull();
  expect((section as HTMLElement).className.length).toBeGreaterThan(0);
});

/*
 * Untestable criteria (require a human eye or visual regression tooling):
 *
 * AC1 — "Restyle the Alerts & Insights screen to match wireframe_alerts_insights.html"
 *       Pixel-accurate visual match cannot be verified in JSDOM; requires screenshot
 *       comparison (e.g. Playwright visual regression) or manual review against the wireframe.
 *
 * CSS custom-property computed values — JSDOM does not evaluate CSS custom properties
 *       from imported stylesheets, so getComputedStyle(el).backgroundColor returns ""
 *       even when the element has a class that sets background-color via var(--color-...).
 *       Verifying that var(--color-danger-bg) resolves to #fef2f2 at runtime requires
 *       a real browser (Playwright/Cypress).
 */

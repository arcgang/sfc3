/**
 * Acceptance tests for: "Restyle Dashboard - WellnessHub to match the updated design"
 *
 * Story criteria tested here:
 *  1. tokens.css is imported at the app root (design tokens in the import chain)
 *  2. All required design token CSS custom properties are defined in index.css
 *  3. All required design token CSS custom properties are defined in tokens.css
 *  4. DashboardPage.module.css uses only var(--…) references, no raw hex/px colour literals
 *  5. DashboardPage.module.css contains the three required responsive breakpoints
 *  6. The Dashboard screen renders the four expected structural sections
 *  7. The Trends section with two chart headings is present
 *  8. The Insights and Alerts two-column info-grid is present
 *  9. The Goals section with "On track / At risk / Missed" stat labels is present
 * 10. The sync-status row shows the last-synced chip and Refresh button
 *
 * Criteria 2–8 of the story spec (the token value lists) are verified by reading
 * the committed CSS files. They are not visual-only — missing a variable means the
 * design system is broken, and the test fails loudly.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { DashboardPage } from "./pages/DashboardPage.js";
import { Layout } from "./components/Layout.js";
import { AuthProvider } from "./context/AuthContext.js";
import * as apiModule from "./api.js";

vi.mock("./api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockApiFetch = apiModule.apiFetch as MockedFunction<typeof apiModule.apiFetch>;

// ── File paths ────────────────────────────────────────────────────────────────

const SRC = resolve(__dirname, ".");
const INDEX_CSS = resolve(SRC, "index.css");
const TOKENS_CSS = resolve(SRC, "styles/tokens.css");
const MAIN_TSX = resolve(SRC, "main.tsx");
const DASHBOARD_MODULE_CSS = resolve(SRC, "pages/DashboardPage.module.css");

// ── Fixture helpers ───────────────────────────────────────────────────────────

const SEVEN_DAYS_STEPS = [
  { date: "2026-07-31", stepCount: 7210 },
  { date: "2026-08-01", stepCount: 8040 },
  { date: "2026-08-02", stepCount: 6400 },
  { date: "2026-08-03", stepCount: 9100 },
  { date: "2026-08-04", stepCount: 10220 },
  { date: "2026-08-05", stepCount: 9870 },
  { date: "2026-08-06", stepCount: 7842 },
];

const INTRADAY_HR = [
  { recordedAt: "2026-08-06T08:00:00.000Z", bpm: 68 },
  { recordedAt: "2026-08-06T10:00:00.000Z", bpm: 85 },
  { recordedAt: "2026-08-06T12:00:00.000Z", bpm: 103 },
  { recordedAt: "2026-08-06T14:00:00.000Z", bpm: 92 },
  { recordedAt: "2026-08-06T16:00:00.000Z", bpm: 78 },
];

function makeDashboardResponse() {
  return {
    data: {
      greeting: "Good morning, Michael!",
      personaMode: "default",
      summaryCards: [
        { id: "HeartRate", label: "Resting Heart Rate", value: 103, unit: "bpm", badge: "⚠️ Monitor", emptyState: false },
        { id: "Steps", label: "Steps", value: 2097, unit: "steps", badge: "↑ 21% of goal", emptyState: false },
        { id: "BloodPressure", label: "Blood Pressure", value: "109/85", unit: "mmHg", badge: "⚠️ Elevated", emptyState: false },
        { id: "Sleep", label: "Sleep", value: 570, unit: "minutes", badge: "→ Fair", emptyState: false },
      ],
      lastSyncStatus: {
        overallLastSyncAt: "2026-08-06T10:00:00.000Z",
        isStale: false,
        staleThresholdHours: 18,
        stalenessLabel: "Up to date",
        deviceStatuses: [],
      },
      trends: {
        steps7d: SEVEN_DAYS_STEPS,
        heartRateToday: INTRADAY_HR,
        stepsGoal: 10000,
      },
      insights: [
        { category: "SleepQualityImproved", title: "Sleep Improvement", narrative: "Your sleep average improved by 32 minutes.", icon: "💡" },
        { category: "ActivityStreak", title: "Activity Streak", narrative: "You've hit your step goal 5 days in a row.", icon: "🎯" },
      ],
    },
  };
}

function makeGoalsResponse(statuses: string[] = []) {
  return {
    data: {
      goals: statuses.map((status, i) => ({
        id: String(i + 1),
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
        startDate: "2026-01-01",
        status,
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    },
  };
}

function renderDashboard() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse(["active", "at_risk"]));
    if (path === "/recommendations") return Promise.resolve({ data: [] });
    if (path === "/alerts") return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Precondition: CSS files exist on disk ─────────────────────────────────────

test("precondition: index.css exists and is non-empty", () => {
  const content = readFileSync(INDEX_CSS, "utf-8");
  expect(content.length).toBeGreaterThan(0);
});

test("precondition: tokens.css exists and is non-empty", () => {
  const content = readFileSync(TOKENS_CSS, "utf-8");
  expect(content.length).toBeGreaterThan(0);
});

test("precondition: DashboardPage.module.css exists and is non-empty", () => {
  const content = readFileSync(DASHBOARD_MODULE_CSS, "utf-8");
  expect(content.length).toBeGreaterThan(0);
});

// ── Criterion 1: tokens.css imported at the app root ─────────────────────────
// Story: "design tokens (no raw hex/px values)" requires the token file is
// reachable from the entry bundle.

test("criterion 1: main.tsx imports tokens.css so design tokens are in the app bundle", () => {
  const main = readFileSync(MAIN_TSX, "utf-8");
  // tokens.css must be explicitly imported at the root entry point
  expect(main).toMatch(/import\s+['"].*tokens\.css['"]/);
});

test("criterion 1: index.css is imported at the app root entry point", () => {
  const main = readFileSync(MAIN_TSX, "utf-8");
  expect(main).toMatch(/import\s+['"].*index\.css['"]/);
});

// ── Criterion 2: Required colour tokens are defined in index.css ──────────────

const REQUIRED_COLOR_TOKENS_INDEX = [
  "--color-teal-500",
  "--color-teal-600",
  "--color-teal-50",
  "--color-teal-100",
  "--color-gray-800",
  "--color-gray-500",
  "--color-gray-200",
  "--color-gray-100",
  "--color-white",
  "--color-danger",
  "--color-danger-bg",
  "--color-amber",
  "--color-amber-bg",
  "--color-amber-dark",
  "--color-shadow-sm",
  "--color-shadow-md",
];

test.each(REQUIRED_COLOR_TOKENS_INDEX)(
  "criterion 2: index.css defines colour token %s",
  (token) => {
    const css = readFileSync(INDEX_CSS, "utf-8");
    expect(css).toContain(token);
  },
);

// ── Criterion 3: Required colour tokens are defined in tokens.css ─────────────

const REQUIRED_COLOR_TOKENS_TOKENS = [
  "--color-teal-500",       // #14b8a6
  "--color-teal-600",       // #0d9488
  "--color-teal-800",       // #115e59
  "--color-teal-900",       // #065f46
  "--color-teal-50",        // #f0fdfa
  "--color-teal-100",       // #ccfbf1
  "--color-gray-50",        // #f9fafb
  "--color-gray-200",       // #e5e7eb
  "--color-gray-500",       // #6b7280
  "--color-gray-700",       // #374151
  "--color-gray-800",       // #1f2937
  "--color-white",          // #ffffff
  "--color-red-50",         // #fef2f2
  "--color-red-100",        // #fee2e2
  "--color-red-500",        // #ef4444
  "--color-red-800",        // #991b1b
  "--color-red-coral",      // #ff6b6b
  "--color-amber-50",       // #fffbeb
  "--color-amber-100",      // #fef3c7
  "--color-amber-500",      // #f59e0b
  "--color-amber-800",      // #92400e
  "--color-green-100",      // #d1fae5
  "--color-green-800",      // #065f46
];

test.each(REQUIRED_COLOR_TOKENS_TOKENS)(
  "criterion 3: tokens.css defines colour token %s",
  (token) => {
    const css = readFileSync(TOKENS_CSS, "utf-8");
    expect(css).toContain(token);
  },
);

// ── Criterion 3: Required font-size tokens ────────────────────────────────────

const REQUIRED_FONT_SIZES = [
  ["11px", "--font-size-11"],
  ["12px", "--font-size-12"],
  ["13px", "--font-size-13"],
  ["14px", "--font-size-14"],
  ["15px", "--font-size-15"],
  ["16px", "--font-size-16"],
  ["18px", "--font-size-18"],
  ["20px", "--font-size-20"],
  ["24px", "--font-size-24"],
  ["28px", "--font-size-28"],
  ["32px", "--font-size-32"],
  ["40px", "--font-size-40"],
  ["48px", "--font-size-48"],
];

test.each(REQUIRED_FONT_SIZES)(
  "criterion 4: tokens.css defines %s font-size token (%s)",
  (_px, token) => {
    const css = readFileSync(TOKENS_CSS, "utf-8");
    expect(css).toContain(token);
  },
);

// ── Criterion 5: Required spacing tokens ─────────────────────────────────────

const REQUIRED_SPACING = [
  "--space-1",        // 4px
  "--space-sidebar",  // 200px
  "--space-sidebar-wide", // 240px
];

test.each(REQUIRED_SPACING)(
  "criterion 5: tokens.css defines spacing token %s",
  (token) => {
    const css = readFileSync(TOKENS_CSS, "utf-8");
    expect(css).toContain(token);
  },
);

// ── Criterion 6: Required radius tokens ──────────────────────────────────────

const REQUIRED_RADII = [
  "--radius-1",   // 3px
  "--radius-2",   // 4px
  "--radius-3",   // 5px
  "--radius-4",   // 6px
  "--radius-5",   // 8px
  "--radius-6",   // 12px
  "--radius-7",   // 16px
  "--radius-8",   // 20px
];

test.each(REQUIRED_RADII)(
  "criterion 6: tokens.css defines radius token %s",
  (token) => {
    const css = readFileSync(TOKENS_CSS, "utf-8");
    expect(css).toContain(token);
  },
);

// ── Criterion 7: Required shadow tokens ──────────────────────────────────────

const REQUIRED_SHADOWS = [
  ["--shadow-xs", "0 1px 3px rgba(0, 0, 0, 0.05)"],
  ["--shadow-md", "0 4px 24px rgba(0, 0, 0, 0.08)"],
  ["--shadow-sm", "0 4px 16px rgba(0, 0, 0, 0.08)"],
  ["--shadow-focus-ring", "0 0 0 3px rgba(20, 184, 166, 0.1)"],
  ["--shadow-lg", "0 4px 12px rgba(0, 0, 0, 0.15)"],
];

test.each(REQUIRED_SHADOWS)(
  "criterion 7: tokens.css defines shadow token %s with correct value",
  (token, value) => {
    const css = readFileSync(TOKENS_CSS, "utf-8");
    expect(css).toContain(token);
    expect(css).toContain(value);
  },
);

// ── Criterion 8: Required gradient tokens ────────────────────────────────────

const REQUIRED_GRADIENTS = [
  ["--gradient-teal-diagonal",    "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)"],
  ["--gradient-teal-light",       "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)"],
  ["--gradient-teal-horizontal",  "linear-gradient(90deg, #14b8a6 0%, #0d9488 100%)"],
  ["--gradient-coral",            "linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)"],
  ["--gradient-red-horizontal",   "linear-gradient(to right, #fee2e2 0%, #fecaca 50%, #fca5a5 100%)"],
  ["--gradient-blue-horizontal",  "linear-gradient(to right, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)"],
  ["--gradient-amber-horizontal", "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)"],
  ["--gradient-red-solid",        "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)"],
];

test.each(REQUIRED_GRADIENTS)(
  "criterion 8: tokens.css defines gradient token %s",
  (token, value) => {
    const css = readFileSync(TOKENS_CSS, "utf-8");
    expect(css).toContain(token);
    // Values are case-insensitive in CSS; normalise to lowercase for comparison
    expect(css.toLowerCase()).toContain(value.toLowerCase());
  },
);

// Also check index.css has the gradients (it defines --gradient-* vars used by the Dashboard)
const REQUIRED_GRADIENTS_INDEX = [
  "--gradient-teal-primary",
  "--gradient-teal-light",
  "--gradient-teal-bar",
  "--gradient-danger-bar",
  "--gradient-blue-bar",
  "--gradient-amber-bar",
  "--gradient-red-bar",
];

test.each(REQUIRED_GRADIENTS_INDEX)(
  "criterion 8: index.css defines gradient token %s",
  (token) => {
    const css = readFileSync(INDEX_CSS, "utf-8");
    expect(css).toContain(token);
  },
);

// ── Criterion 9: DashboardPage.module.css uses no raw hex colour literals ──────
// All colour values must come from var(--…), never hardcoded hex.

test("criterion 9 (no raw hex): DashboardPage.module.css contains no hardcoded hex colour literals", () => {
  const css = readFileSync(DASHBOARD_MODULE_CSS, "utf-8");
  // Strip comments first so commented-out hex does not count
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const matches = stripped.match(hexPattern) ?? [];
  expect(matches).toEqual([]);
});

// ── Criterion 9: Breakpoints ──────────────────────────────────────────────────

test("criterion 9 (breakpoints): DashboardPage.module.css has a 480px media query", () => {
  const css = readFileSync(DASHBOARD_MODULE_CSS, "utf-8");
  expect(css).toContain("max-width: 480px");
});

test("criterion 9 (breakpoints): DashboardPage.module.css has a 768px media query", () => {
  const css = readFileSync(DASHBOARD_MODULE_CSS, "utf-8");
  expect(css).toContain("max-width: 768px");
});

test("criterion 9 (breakpoints): DashboardPage.module.css has a 1024px media query", () => {
  const css = readFileSync(DASHBOARD_MODULE_CSS, "utf-8");
  expect(css).toContain("max-width: 1024px");
});

// ── Structural rendering: end-to-end through DashboardPage ───────────────────
// These tests exercise the actual component using the same entry points already
// used in DashboardPage.test.tsx, but target the seam between the token task
// (CSS variables present) and the restyle task (component renders against them).

test("criterion 1 (structural): DashboardPage renders the H1 greeting from the API", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
});

test("criterion 1 (structural): DashboardPage renders the Trends section heading", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Trends", level: 2 });
});

test("criterion 1 (structural): DashboardPage renders the heart-rate chart heading", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Today's Heart Rate Fluctuations", level: 3 });
});

test("criterion 1 (structural): DashboardPage renders the steps chart heading", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "This Week's Step Activity", level: 3 });
});

test("criterion 1 (structural): DashboardPage renders the Insights section heading", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Insights", level: 2 });
});

test("criterion 1 (structural): DashboardPage renders the Alerts section heading", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Alerts", level: 2 });
});

test("criterion 1 (structural): DashboardPage renders the Goals section heading", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Goals", level: 2 });
});

test("criterion 1 (structural): Goals section renders On track / At risk / Missed stat labels", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Goals summary" });
  expect(within(list).getByText("On track")).toBeTruthy();
  expect(within(list).getByText("At risk")).toBeTruthy();
  expect(within(list).getByText("Missed")).toBeTruthy();
});

test("criterion 1 (structural): sync-status row shows ✓ Last synced chip", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  expect(screen.getByText(/✓ Last synced:/)).toBeTruthy();
});

test("criterion 1 (structural): sync-status row contains a Refresh button", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  expect(screen.getByRole("button", { name: "Refresh dashboard" })).toBeTruthy();
});

test("criterion 1 (structural): four metric cards are rendered in the Health metrics list", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = screen.getByRole("list", { name: "Health metrics" });
  expect(within(list).getAllByRole("listitem").length).toBe(4);
});

test("criterion 1 (structural): Insights section renders insight titles from the API", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  await waitFor(() => {
    expect(screen.getByText("Sleep Improvement")).toBeTruthy();
    expect(screen.getByText("Activity Streak")).toBeTruthy();
  });
});

test("criterion 1 (structural): View All Goals link points to /goals", async () => {
  renderDashboard();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const link = screen.getByRole("link", { name: "View All Goals →" });
  expect(link.getAttribute("href")).toBe("/goals");
});

// ── font-family token defined in index.css ────────────────────────────────────

test("criterion 3 (fonts): index.css defines the Inter font-family custom property", () => {
  const css = readFileSync(INDEX_CSS, "utf-8");
  // --font-sans must include 'Inter'
  expect(css).toContain("--font-sans");
  expect(css).toContain("Inter");
});

test("criterion 3 (fonts): tokens.css defines the --font-family-base with Inter", () => {
  const css = readFileSync(TOKENS_CSS, "utf-8");
  expect(css).toContain("--font-family-base");
  expect(css).toContain("Inter");
});

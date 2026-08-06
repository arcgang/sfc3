/**
 * Acceptance tests for "Restyle Goals & Progress - WellnessHub to match the updated design"
 *
 * Story tasks merged:
 *   1. Verify and extend design tokens for Goals & Progress restyle
 *   2. Restyle Goals & Progress screen to match wireframe using design tokens
 *
 * These tests exercise the SEAM between both tasks: that the tokens defined in
 * task 1 are complete, and that the component CSS in task 2 references only
 * those tokens (no raw hex/px values).
 *
 * Criterion mapping:
 *   AC1  — GoalsProgressPage.module.css uses only design tokens (no raw hex color literals);
 *           every var(--token) reference resolves against tokens.css + index.css
 *   AC2  — All specified color tokens defined in tokens.css
 *   AC3  — Font family token defined in tokens.css
 *   AC4  — All specified font-size tokens defined in tokens.css
 *   AC5  — All specified spacing tokens defined in tokens.css
 *   AC6  — All specified radius tokens defined in tokens.css
 *   AC7  — All specified shadow tokens defined in tokens.css
 *   AC8  — All specified gradient tokens defined (tokens.css + index.css aliases)
 *   AC9  — All specified breakpoints defined in tokens.css
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { GoalsProgressPage } from "./pages/GoalsProgressPage.js";
import { Layout } from "./components/Layout.js";
import { AuthProvider } from "./context/AuthContext.js";

// ── File paths ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS = resolve(__dirname, "styles/tokens.css");
const INDEX_CSS = resolve(__dirname, "index.css");
const MODULE_CSS = resolve(__dirname, "pages/GoalsProgressPage.module.css");
const MAIN_TSX = resolve(__dirname, "main.tsx");

// ── Helpers ───────────────────────────────────────────────────────────────────

function readCss(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Extract all --custom-property names defined in a CSS file. */
function extractDefinedTokens(css: string): Set<string> {
  const defined = new Set<string>();
  for (const m of css.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) {
    defined.add(`--${m[1]}`);
  }
  return defined;
}

/** Extract all var(--name) references from a CSS file. */
function extractVarReferences(css: string): Set<string> {
  const refs = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    refs.add(m[1] as string);
  }
  return refs;
}

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

vi.mock("./api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { apiFetch } from "./api.js";
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const FIVE_DESIGN_GOALS = [
  {
    id: "goal-steps",
    goalType: "steps_daily",
    targetValue: 10000,
    targetUnit: "steps",
    cadence: "daily" as const,
    startDate: "2026-01-15",
    status: "on_track" as const,
    currentDisplay: "8,543 steps",
    progressPercent: 85,
    weekOverWeekChange: "Up 5% from last week",
    section: "active" as const,
    endDate: null,
    createdAt: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "goal-sleep",
    goalType: "sleep_minutes_daily",
    targetValue: 420,
    targetUnit: "minutes",
    cadence: "daily" as const,
    startDate: "2026-01-10",
    status: "on_track" as const,
    currentDisplay: "7h 23m",
    progressPercent: 105,
    weekOverWeekChange: "Improved by 32 minutes this week",
    section: "active" as const,
    endDate: null,
    createdAt: "2026-01-10T00:00:00.000Z",
  },
  {
    id: "goal-weight",
    goalType: "weight_target",
    targetValue: 5,
    targetUnit: "lbs",
    cadence: "daily" as const,
    startDate: "2026-01-01",
    status: "at_risk" as const,
    currentDisplay: "2.3 lbs",
    progressPercent: 46,
    weekOverWeekChange: "Behind pace for monthly target",
    section: "active" as const,
    endDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "goal-exercise",
    goalType: "active_minutes_weekly",
    targetValue: 150,
    targetUnit: "minutes",
    cadence: "weekly" as const,
    startDate: "2026-01-08",
    status: "on_track" as const,
    currentDisplay: "127 minutes",
    progressPercent: 85,
    weekOverWeekChange: "3 days left to reach target",
    section: "active" as const,
    endDate: null,
    createdAt: "2026-01-08T00:00:00.000Z",
  },
  {
    id: "goal-water",
    goalType: "water_daily",
    targetValue: 8,
    targetUnit: "glasses",
    cadence: "daily" as const,
    startDate: "2026-01-05",
    status: "missed" as const,
    currentDisplay: "4 glasses",
    progressPercent: 50,
    weekOverWeekChange: "Missed yesterday's target",
    section: "active" as const,
    endDate: null,
    createdAt: "2026-01-05T00:00:00.000Z",
  },
];

const DESIGN_INSIGHTS = [
  {
    id: "ins-1",
    goalId: null,
    title: "Consistency Pays Off",
    body: "You've hit your step goal 5 days in a row. Maintaining this consistency will help you reach your monthly activity target ahead of schedule.",
    insightType: "recommendation",
    createdAt: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "ins-2",
    goalId: "goal-weight",
    title: "Weight Loss Strategy",
    body: "To get back on track with your weight goal, try increasing your weekly exercise by 30 minutes and tracking your calorie intake more closely.",
    insightType: "recommendation",
    createdAt: "2026-01-15T00:00:00.000Z",
  },
];

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ data: { goals: [], insights: [] } });
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderGoalsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/goals"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/goals" element={<GoalsProgressPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// ── Preconditions: required files exist ───────────────────────────────────────

describe("preconditions", () => {
  test("tokens.css exists at src/styles/tokens.css", () => {
    // If this throws, the design-token foundation task never landed.
    expect(() => readCss(TOKENS_CSS)).not.toThrow();
    expect(readCss(TOKENS_CSS).length).toBeGreaterThan(0);
  });

  test("GoalsProgressPage.module.css exists", () => {
    expect(() => readCss(MODULE_CSS)).not.toThrow();
    expect(readCss(MODULE_CSS).length).toBeGreaterThan(0);
  });

  test("tokens.css is imported in main.tsx (app root)", () => {
    const main = readFileSync(MAIN_TSX, "utf-8");
    // Convention: global stylesheet must be in the import chain reaching the bundle
    expect(main).toMatch(/import.*tokens\.css/);
  });
});

// ── AC2: Color tokens ─────────────────────────────────────────────────────────

describe("AC2 — color tokens are defined in tokens.css", () => {
  const REQUIRED_COLORS = [
    // Teal palette
    "--color-teal-500",   // #14b8a6
    "--color-teal-600",   // #0d9488
    "--color-teal-800",   // #115e59
    "--color-teal-900",   // #065f46
    "--color-teal-50",    // #f0fdfa
    "--color-teal-100",   // #ccfbf1
    // Neutral / gray
    "--color-gray-50",    // #f9fafb
    "--color-gray-200",   // #e5e7eb
    "--color-gray-500",   // #6b7280
    "--color-gray-700",   // #374151
    "--color-gray-800",   // #1f2937
    // White
    "--color-white",      // #ffffff
    // Red / danger
    "--color-red-50",     // #fef2f2 (fef2f2 ≈ fef2f2; spec has #fef2f2)
    "--color-red-100",    // #fee2e2
    "--color-red-500",    // #ef4444
    "--color-red-800",    // #991b1b
    "--color-red-coral",  // #ff6b6b
    // Amber
    "--color-amber-50",   // #fffbeb
    "--color-amber-100",  // #fef3c7
    "--color-amber-500",  // #f59e0b
    // Green / success
    "--color-green-100",  // #d1fae5
    "--color-green-800",  // #065f46
    // Shadow / translucent
    "--color-shadow-xs",        // rgba(0,0,0,0.05)
    "--color-shadow-sm",        // rgba(0,0,0,0.08)
    "--color-teal-focus-ring",  // rgba(20,184,166,0.1)
  ];

  const css = readCss(TOKENS_CSS);
  const defined = extractDefinedTokens(css);

  test.each(REQUIRED_COLORS)("%s is defined", (token) => {
    expect(defined.has(token)).toBe(true);
  });
});

// ── AC3: Font tokens ──────────────────────────────────────────────────────────

describe("AC3 — font-family token is defined in tokens.css", () => {
  test("--font-family-base is defined and includes Inter", () => {
    const css = readCss(TOKENS_CSS);
    expect(css).toMatch(/--font-family-base\s*:/);
    // Value must include Inter (primary font from spec)
    const match = css.match(/--font-family-base\s*:\s*([^;]+);/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/Inter/);
  });
});

// ── AC4: Font-size tokens ─────────────────────────────────────────────────────

describe("AC4 — all specified font-size tokens are defined in tokens.css", () => {
  const REQUIRED_SIZES = [
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

  const css = readCss(TOKENS_CSS);
  const defined = extractDefinedTokens(css);

  test.each(REQUIRED_SIZES)("%s is defined", (token) => {
    expect(defined.has(token)).toBe(true);
  });

  test("--font-size-11 resolves to 11px", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--font-size-11\s*:\s*11px/);
  });

  test("--font-size-28 resolves to 28px (page title size)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--font-size-28\s*:\s*28px/);
  });
});

// ── AC5: Spacing tokens ───────────────────────────────────────────────────────

describe("AC5 — all specified spacing values are represented in tokens.css", () => {
  // Design spec spacing: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 20px, 24px,
  //                      32px, 40px, 48px, 64px, 80px, 200px, 240px
  const SPACING_VALUES: [string, string][] = [
    ["--space-1",  "4px"],
    ["--space-2",  "6px"],
    ["--space-3",  "8px"],
    ["--space-4",  "10px"],
    ["--space-5",  "12px"],
    ["--space-6",  "14px"],
    ["--space-7",  "16px"],
    ["--space-8",  "20px"],
    ["--space-9",  "24px"],
    ["--space-10", "32px"],
    ["--space-11", "40px"],
    ["--space-12", "48px"],
    ["--space-13", "64px"],
    ["--space-14", "80px"],
    ["--space-sidebar",      "200px"],
    ["--space-sidebar-wide", "240px"],
  ];

  const css = readCss(TOKENS_CSS);
  const defined = extractDefinedTokens(css);

  test.each(SPACING_VALUES)("%s (%s) is defined", (token) => {
    expect(defined.has(token)).toBe(true);
  });

  test.each(SPACING_VALUES)("%s resolves to %s", (token, px) => {
    const re = new RegExp(`${token.replace(/-/g, "\\-")}\\s*:\\s*${px}`);
    expect(readCss(TOKENS_CSS)).toMatch(re);
  });
});

// ── AC6: Radius tokens ────────────────────────────────────────────────────────

describe("AC6 — all specified radius values are defined in tokens.css", () => {
  // Design spec radii: 3px, 4px, 5px, 6px, 8px, 12px, 16px, 20px
  const RADIUS_VALUES: [string, string][] = [
    ["--radius-1", "3px"],
    ["--radius-2", "4px"],
    ["--radius-3", "5px"],
    ["--radius-4", "6px"],
    ["--radius-5", "8px"],
    ["--radius-6", "12px"],
    ["--radius-7", "16px"],
    ["--radius-8", "20px"],
  ];

  const css = readCss(TOKENS_CSS);
  const defined = extractDefinedTokens(css);

  test.each(RADIUS_VALUES)("%s (%s) is defined", (token) => {
    expect(defined.has(token)).toBe(true);
  });

  test.each(RADIUS_VALUES)("%s resolves to %s", (token, px) => {
    const re = new RegExp(`${token.replace(/-/g, "\\-")}\\s*:\\s*${px}`);
    expect(readCss(TOKENS_CSS)).toMatch(re);
  });
});

// ── AC7: Shadow tokens ────────────────────────────────────────────────────────

describe("AC7 — all specified shadow tokens are defined in tokens.css", () => {
  test("--shadow-xs is defined (0 1px 3px rgba(0,0,0,0.05))", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-xs\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-xs\s*:\s*0 1px 3px/);
  });

  test("--shadow-sm is defined (0 4px 16px rgba(0,0,0,0.08))", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-sm\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-sm\s*:\s*0 4px 16px/);
  });

  test("--shadow-md is defined (0 4px 24px rgba(0,0,0,0.08))", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-md\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-md\s*:\s*0 4px 24px/);
  });

  test("--shadow-focus-ring is defined (0 0 0 3px rgba(20,184,166,0.1))", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-focus-ring\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-focus-ring\s*:\s*0 0 0 3px/);
  });

  test("--shadow-lg is defined (0 4px 12px rgba(0,0,0,0.15))", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-lg\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/--shadow-lg\s*:\s*0 4px 12px/);
  });
});

// ── AC8: Gradient tokens ──────────────────────────────────────────────────────

describe("AC8 — all specified gradient tokens are defined in tokens.css or index.css", () => {
  // The module CSS uses aliases defined in index.css that point to tokens.css values.
  // We check that both layers provide the complete gradient set.

  test("--gradient-teal-diagonal is in tokens.css (135deg, #14B8A6 → #0D9488)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-teal-diagonal\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/135deg.*#14b8a6.*#0d9488/i);
  });

  test("--gradient-teal-light is in tokens.css (135deg, #F0FDFA → #CCFBF1)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-teal-light\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/135deg.*#f0fdfa.*#ccfbf1/i);
  });

  test("--gradient-teal-horizontal is in tokens.css (90deg, #14B8A6 → #0D9488)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-teal-horizontal\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/90deg.*#14b8a6.*#0d9488/i);
  });

  test("--gradient-coral is in tokens.css (135deg, #FF6B6B → #FF8E53)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-coral\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/135deg.*#ff6b6b.*#ff8e53/i);
  });

  test("--gradient-amber-horizontal is in tokens.css (90deg, #F59E0B → #D97706)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-amber-horizontal\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/90deg.*#f59e0b.*#d97706/i);
  });

  test("--gradient-red-solid is in tokens.css (90deg, #EF4444 → #DC2626)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-red-solid\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/90deg.*#ef4444.*#dc2626/i);
  });

  test("--gradient-red-horizontal is in tokens.css (to right, #FEE2E2 → #FECACA → #FCA5A5)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-red-horizontal\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/to right.*#fee2e2.*#fecaca.*#fca5a5/i);
  });

  test("--gradient-blue-horizontal is in tokens.css (to right, #DBEAFE → #BFDBFE → #93C5FD)", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--gradient-blue-horizontal\s*:/);
    expect(readCss(TOKENS_CSS)).toMatch(/to right.*#dbeafe.*#bfdbfe.*#93c5fd/i);
  });

  // Module CSS uses aliases from index.css; verify those aliases exist.
  test("--gradient-teal-bar alias is defined in index.css (used by progress bar)", () => {
    expect(readCss(INDEX_CSS)).toMatch(/--gradient-teal-bar\s*:/);
  });

  test("--gradient-amber-bar alias is defined in index.css (used by at-risk progress bar)", () => {
    expect(readCss(INDEX_CSS)).toMatch(/--gradient-amber-bar\s*:/);
  });

  test("--gradient-red-bar alias is defined in index.css (used by missed progress bar)", () => {
    expect(readCss(INDEX_CSS)).toMatch(/--gradient-red-bar\s*:/);
  });
});

// ── AC9: Breakpoint tokens ────────────────────────────────────────────────────

describe("AC9 — all specified breakpoints are defined in tokens.css", () => {
  test("--breakpoint-sm resolves to 480px", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--breakpoint-sm\s*:\s*480px/);
  });

  test("--breakpoint-md resolves to 768px", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--breakpoint-md\s*:\s*768px/);
  });

  test("--breakpoint-lg resolves to 1024px", () => {
    expect(readCss(TOKENS_CSS)).toMatch(/--breakpoint-lg\s*:\s*1024px/);
  });

  test("module CSS uses 768px breakpoint matching --breakpoint-md", () => {
    // The media query @media (max-width: 768px) must be present in the module CSS.
    expect(readCss(MODULE_CSS)).toMatch(/@media\s*\(max-width:\s*768px\)/);
  });

  test("module CSS uses 1024px breakpoint matching --breakpoint-lg", () => {
    expect(readCss(MODULE_CSS)).toMatch(/@media\s*\(max-width:\s*1024px\)/);
  });

  test("module CSS uses 480px breakpoint matching --breakpoint-sm", () => {
    expect(readCss(MODULE_CSS)).toMatch(/@media\s*\(max-width:\s*480px\)/);
  });
});

// ── AC1: No raw hex colors in GoalsProgressPage.module.css ───────────────────

describe("AC1 — GoalsProgressPage.module.css styling only from design tokens", () => {
  test("module CSS contains no raw hex color literals (all colors via var())", () => {
    const css = readCss(MODULE_CSS);
    // Strip comments, then check for hex literals outside var() declarations
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    // Match #rrggbb or #rgb not inside a var() value (which would be in tokens.css)
    const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexMatches).toHaveLength(0);
  });

  test("every var(--token) in module CSS resolves in tokens.css or index.css", () => {
    const moduleCss = readCss(MODULE_CSS);
    const tokensCss = readCss(TOKENS_CSS);
    const indexCss = readCss(INDEX_CSS);

    const referenced = extractVarReferences(moduleCss);
    const definedInTokens = extractDefinedTokens(tokensCss);
    const definedInIndex = extractDefinedTokens(indexCss);
    const allDefined = new Set([...definedInTokens, ...definedInIndex]);

    const unresolved: string[] = [];
    for (const ref of referenced) {
      if (!allDefined.has(ref)) {
        unresolved.push(ref);
      }
    }

    expect(unresolved).toHaveLength(0);
  });
});

// ── Page rendering: structural elements from the wireframe ───────────────────

describe("page rendering — structural elements match wireframe", () => {
  test("renders 'Goals & Progress' h1 heading", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Goals & Progress", level: 1 }),
    );
  });

  test("renders '+ Create New Goal' button", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByRole("button", { name: "+ Create New Goal" }),
    );
  });

  test("renders all five design-example goal names from the wireframe", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Walk steps daily"));
    screen.getByText("Sleep minutes daily");
    screen.getByText("Weight target");
    screen.getByText("Exercise active minutes weekly");
  });

  test("three 'On Track' badges for the three on-track goals", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Walk steps daily"));
    expect(screen.getAllByText("On Track")).toHaveLength(3);
  });

  test("one 'At Risk' badge for the weight goal", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Weight target"));
    expect(screen.getAllByText("At Risk")).toHaveLength(1);
    const card = screen.getByText("Weight target").closest("li");
    expect(card?.textContent).toContain("At Risk");
  });

  test("one 'Missed' badge for the water goal", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("water_daily"));
    const card = screen.getByText("water_daily").closest("li");
    expect(within(card!).getByText("Missed")).toBeTruthy();
  });

  test("progress bars render with role=progressbar and aria-valuenow", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Walk steps daily"));
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThanOrEqual(4);

    const stepBar = bars.find(
      (b) => b.getAttribute("aria-label")?.includes("steps"),
    );
    expect(stepBar).toBeTruthy();
    expect(Number(stepBar!.getAttribute("aria-valuenow"))).toBe(85);
  });

  test("weight goal progress bar reflects at-risk percent (46)", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Weight target"));
    const bars = screen.getAllByRole("progressbar");
    const weightBar = bars.find(
      (b) => b.getAttribute("aria-label")?.includes("Weight target"),
    );
    expect(weightBar).toBeTruthy();
    expect(Number(weightBar!.getAttribute("aria-valuenow"))).toBe(46);
  });

  test("week-over-week trend texts render in the goal cards", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: FIVE_DESIGN_GOALS, insights: [] },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Walk steps daily"));
    screen.getByText("Up 5% from last week");
    screen.getByText("Improved by 32 minutes this week");
    screen.getByText("Behind pace for monthly target");
  });

  test("renders 'Goal Insights' h2 section heading", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Goal Insights", level: 2 }),
    );
  });

  test("renders insight cards with titles from wireframe", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: [], insights: DESIGN_INSIGHTS },
    });
    renderGoalsPage();

    await waitFor(() => screen.getByText("Consistency Pays Off"));
    screen.getByText("Weight Loss Strategy");
  });

  test("insight body text matches the wireframe copy", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: { goals: [], insights: DESIGN_INSIGHTS },
    });
    renderGoalsPage();

    await waitFor(() =>
      screen.getByText(
        "You've hit your step goal 5 days in a row. Maintaining this consistency will help you reach your monthly activity target ahead of schedule.",
      ),
    );
  });

  test("renders 'Explore structured programs to reach your goals' heading (Coming Soon banner)", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByRole("heading", {
        name: "Explore structured programs to reach your goals",
        level: 2,
      }),
    );
  });

  test("Coming Soon banner shows 'Coming Soon' badge text", async () => {
    renderGoalsPage();
    await waitFor(() => screen.getByText("Coming Soon"));
  });

  test("Coming Soon banner subtitle text matches wireframe", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByText(
        "Join guided wellness programs designed by experts to help you achieve lasting results",
      ),
    );
  });
});

// ── Sidebar shell (design token restyle leaves layout intact) ─────────────────

describe("sidebar navigation is present and intact after restyle", () => {
  test("sidebar navigation landmark is present", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByRole("navigation", { name: "Sidebar navigation" }),
    );
  });

  test("sidebar contains '📊 Dashboard' link", async () => {
    renderGoalsPage();
    await waitFor(() => screen.getByRole("link", { name: "📊 Dashboard" }));
  });

  test("sidebar contains '👤 My Account' link", async () => {
    renderGoalsPage();
    await waitFor(() => screen.getByRole("link", { name: "👤 My Account" }));
  });

  test("sidebar contains '🤝 Partners & Services' link", async () => {
    renderGoalsPage();
    await waitFor(() =>
      screen.getByRole("link", { name: "🤝 Partners & Services" }),
    );
  });

  test("sidebar shows user name 'Alex Johnson'", async () => {
    renderGoalsPage();
    await waitFor(() => screen.getByText("Alex Johnson"));
  });

  test("sidebar shows user email 'alex@example.com'", async () => {
    renderGoalsPage();
    await waitFor(() => screen.getByText("alex@example.com"));
  });

  test("sidebar 'Log out' link is present", async () => {
    renderGoalsPage();
    await waitFor(() => screen.getByRole("link", { name: "Log out" }));
  });
});

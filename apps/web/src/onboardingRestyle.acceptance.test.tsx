/**
 * Acceptance tests: "Restyle Welcome to WellnessHub - Profile Setup to match the updated design"
 *
 * Story tasks merged into this branch:
 *   Task 1 — Extend design tokens in index.css to cover all wireframe values
 *   Task 2 — Restyle OnboardingProfilePage to match wireframe_onboarding_profile.html
 *
 * The seam these tests cover:
 *   Task 2 (page) correctly consumes tokens defined in Task 1, and neither task's
 *   own unit tests verify the cross-task dependency.
 *
 * Criterion labels map to the story's acceptance criteria:
 *   AC1 — restyle matches wireframe, styling only from tokens (no raw hex/px)
 *   AC2 — required colour tokens declared
 *   AC3 — required font-family token declared
 *   AC4 — required font-size tokens declared
 *   AC5 — required spacing tokens declared
 *   AC6 — required border-radius tokens declared
 *   AC7 — required shadow tokens declared
 *   AC8 — required gradient tokens declared
 *   AC9 — required breakpoint tokens declared
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";
import { OnboardingProfilePage } from "./pages/OnboardingProfilePage.js";

vi.mock("./api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// Resolve absolute paths from this file's location so they survive cwd changes.
const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS_PATH = join(__dirname, "styles/tokens.css");
const MODULE_CSS_PATH = join(__dirname, "pages/OnboardingPage.module.css");
const MAIN_TSX_PATH   = join(__dirname, "main.tsx");
const PAGE_TSX_PATH   = join(__dirname, "pages/OnboardingProfilePage.tsx");

function readTokens(): string {
  return readFileSync(TOKENS_CSS_PATH, "utf-8");
}
function readModuleCss(): string {
  return readFileSync(MODULE_CSS_PATH, "utf-8");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingProfilePage />
    </MemoryRouter>,
  );
}

// ── Preconditions: both tasks must have landed ────────────────────────────────

test("precondition: src/styles/tokens.css exists and declares :root custom properties (Task 1 landed)", () => {
  const content = readTokens();
  expect(content.length).toBeGreaterThan(0);
  expect(content).toContain(":root");
  expect(content).toContain("--");
});

test("precondition: tokens.css is imported in main.tsx so tokens reach the page bundle", () => {
  const main = readFileSync(MAIN_TSX_PATH, "utf-8");
  expect(main).toContain("./styles/tokens.css");
});

test("precondition: OnboardingPage.module.css exists and has content (Task 2 landed)", () => {
  expect(readModuleCss().length).toBeGreaterThan(0);
});

test("precondition: OnboardingProfilePage.tsx imports OnboardingPage.module.css (page wired to restyled sheet)", () => {
  const page = readFileSync(PAGE_TSX_PATH, "utf-8");
  expect(page).toContain("OnboardingPage.module.css");
});

// ── AC2: Required colour tokens are declared ──────────────────────────────────

const REQUIRED_HEX_COLORS = [
  "#14b8a6",
  "#6b7280",
  "#1f2937",
  "#e5e7eb",
  "#0d9488",
  "#f0fdfa",
  "#ffffff",
  "#f9fafb",
  "#ef4444",
  "#ccfbf1",
  "#115e59",
  "#fee2e2",
  "#991b1b",
  "#374151",
  "#ff6b6b",
  "#fef2f2",
  "#92400e",
  "#fffbeb",
  "#f59e0b",
  "#fef3c7",
  "#d1fae5",
  "#065f46",
];

test.each(REQUIRED_HEX_COLORS)(
  "AC2: colour token for %s is declared in tokens.css",
  (hex) => {
    expect(readTokens().toLowerCase()).toContain(hex.toLowerCase());
  },
);

test("AC2: rgba(0,0,0,0.05) translucent shadow colour is declared as a token", () => {
  expect(readTokens()).toMatch(/rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.05\s*\)/);
});

test("AC2: rgba(0,0,0,0.08) translucent shadow colour is declared as a token", () => {
  expect(readTokens()).toMatch(/rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)/);
});

// ── AC3: Required font-family token is declared ───────────────────────────────

test("AC3: font-family token names Inter as the primary typeface", () => {
  expect(readTokens()).toContain("Inter");
});

test("AC3: font-family token includes system fallbacks (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif)", () => {
  const tokens = readTokens();
  expect(tokens).toContain("-apple-system");
  expect(tokens).toContain("BlinkMacSystemFont");
  expect(tokens).toContain("Segoe UI");
  expect(tokens).toContain("Roboto");
  expect(tokens).toContain("sans-serif");
});

// ── AC4: Required font-size tokens are declared ───────────────────────────────

test.each(["11px", "12px", "13px", "14px", "15px", "16px", "18px", "20px", "24px", "28px", "32px", "40px", "48px"])(
  "AC4: font-size token for %s is declared in tokens.css",
  (size) => {
    expect(readTokens()).toContain(size);
  },
);

// ── AC5: Required spacing tokens are declared ─────────────────────────────────

test.each([
  "4px", "6px", "8px", "10px", "12px", "14px", "16px", "20px",
  "24px", "32px", "40px", "48px", "64px", "80px", "200px", "240px",
])(
  "AC5: spacing token for %s is declared in tokens.css",
  (size) => {
    expect(readTokens()).toContain(size);
  },
);

// ── AC6: Required border-radius tokens are declared ───────────────────────────

test.each(["3px", "4px", "5px", "6px", "8px", "12px", "16px", "20px"])(
  "AC6: border-radius token for %s is declared in tokens.css",
  (radius) => {
    expect(readTokens()).toContain(radius);
  },
);

// ── AC7: Required shadow tokens are declared ──────────────────────────────────

// Shadows that use plain integer rgba — match the exact formatted strings in tokens.css
test.each([
  "0 1px 3px rgba(0, 0, 0, 0.05)",
  "0 4px 24px rgba(0, 0, 0, 0.08)",
  "0 4px 16px rgba(0, 0, 0, 0.08)",
  "0 4px 12px rgba(0, 0, 0, 0.15)",
])(
  "AC7: shadow token '%s' is declared in tokens.css",
  (shadow) => {
    expect(readTokens()).toContain(shadow);
  },
);

// Focus-ring shadow — rgba values may have flexible spacing
test("AC7: focus-ring shadow rgba(20,184,166,0.1) is declared as a token", () => {
  expect(readTokens()).toMatch(/rgba\s*\(\s*20\s*,\s*184\s*,\s*166\s*,\s*0\.1\s*\)/);
});

// ── AC8: Required gradient tokens are declared ────────────────────────────────

test.each([
  "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
  "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
  "linear-gradient(90deg, #14b8a6 0%, #0d9488 100%)",
  "linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)",
  "linear-gradient(to right, #fee2e2 0%, #fecaca 50%, #fca5a5 100%)",
  "linear-gradient(to right, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)",
  "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
  "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)",
])(
  "AC8: gradient token '%s' is declared in tokens.css",
  (gradient) => {
    expect(readTokens().toLowerCase()).toContain(gradient.toLowerCase());
  },
);

// ── AC9: Required breakpoint tokens are declared ──────────────────────────────

test.each(["480px", "768px", "1024px"])(
  "AC9: breakpoint token for %s is declared in tokens.css",
  (bp) => {
    expect(readTokens()).toContain(bp);
  },
);

// ── AC1: CSS module uses only design tokens — no raw hex colour literals ───────

test("AC1: OnboardingPage.module.css contains no raw hex colour literals (all colours via var())", () => {
  // Strip CSS comments before scanning
  const css = readModuleCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const rawHexMatches = css.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [];
  expect(rawHexMatches).toEqual([]);
});

// ── AC1: CSS module makes substantial use of design-token custom properties ────

test("AC1: OnboardingPage.module.css references design-token custom properties (at least 10 var(--...) usages)", () => {
  const varUsages = (readModuleCss().match(/var\(--/g) ?? []).length;
  expect(varUsages).toBeGreaterThanOrEqual(10);
});

// ── AC1: CSS module includes the 480px responsive breakpoint from the wireframe ─

test("AC1: OnboardingPage.module.css defines the wireframe's 480px responsive breakpoint", () => {
  expect(readModuleCss()).toContain("max-width: 480px");
});

// ── AC1: /onboarding/profile route is registered in the App ──────────────────

test("AC1: /onboarding/profile route renders the OnboardingProfilePage heading via the App router", () => {
  render(
    <MemoryRouter initialEntries={["/onboarding/profile"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Welcome to WellnessHub!", level: 1 });
});

// ── AC1: Structural elements from the wireframe render correctly ──────────────

test("AC1: logo text 'W WellnessHub' renders (wireframe branding element in logo slot)", () => {
  renderPage();
  // Exact text from JSX: <p className={styles.logo}>W WellnessHub</p>
  screen.getByText("W WellnessHub");
});

test("AC1: explanatory subheading copy renders verbatim from the wireframe", () => {
  renderPage();
  screen.getByText("Let's set up your profile to personalize your wellness experience");
});

test("AC1: 'Dashboard Mode *' label renders with required asterisk (wireframe marks field required)", () => {
  renderPage();
  screen.getByText("Dashboard Mode *");
});

test("AC1: all three dashboard-mode option titles render (wireframe enumerates all three)", () => {
  renderPage();
  screen.getByText("Everyday Wellness");
  screen.getByText("Active Fitness");
  screen.getByText("Assisted / Chronic-Care-Aware");
});

test("AC1: 'Wellness Preferences' section label renders (wireframe section heading)", () => {
  renderPage();
  screen.getByText("Wellness Preferences");
});

test("AC1: 'Next: Connect Devices' primary submit button renders (wireframe CTA)", () => {
  renderPage();
  screen.getByRole("button", { name: "Next: Connect Devices" });
});

test("AC1: 'Skip for now' renders as a link element (wireframe specifies it as a link, not a button)", () => {
  renderPage();
  // The wireframe marks this as <a href="#"> — must be a link role, not a button
  screen.getByRole("link", { name: "Skip for now" });
});

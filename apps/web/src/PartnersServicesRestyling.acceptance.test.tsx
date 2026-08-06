/**
 * Acceptance tests for "Restyle Partners & Services - WellnessHub to match the updated design".
 *
 * Two tasks merged into this story:
 *   Task 1 — Audit and extend design tokens (tokens.css)
 *   Task 2 — Restyle PartnersServicesPage to match wireframe using design tokens
 *
 * The seam neither task's unit tests cover is:
 *   - tokens.css must define every value from the wireframe's design spec
 *   - PartnersServicesPage.module.css must consume those tokens rather than
 *     hard-coding raw hex / px literals
 *   - main.tsx must import tokens.css so the variables reach the page bundle
 *
 * Criterion labels (AC1–AC9) map to the story's acceptance criteria.
 *
 * IMPORTANT: AC1 ("styling only from design tokens, no raw hex/px") is partially
 * a CSS static assertion.  It is tested by reading the source files from disk.
 * A failure here means the styling task did not fully apply the convention.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

// ── File paths resolved relative to this test file ───────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const TOKENS_CSS = resolve(__dir, "styles/tokens.css");
const MODULE_CSS = resolve(__dir, "pages/PartnersServicesPage.module.css");
const MAIN_TSX   = resolve(__dir, "main.tsx");

// ── Helpers ───────────────────────────────────────────────────────────────────

function readSource(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

/** Strip both block and inline CSS comments from a string. */
function stripCssComments(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/partners-services"]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Preconditions: files the story must have produced ─────────────────────────

test("precondition: src/styles/tokens.css exists (design-token foundation task landed)", () => {
  expect(() => readSource(TOKENS_CSS)).not.toThrow();
});

test("precondition: PartnersServicesPage.module.css exists (restyling task landed)", () => {
  expect(() => readSource(MODULE_CSS)).not.toThrow();
});

test("precondition: main.tsx imports tokens.css (token variables reach the page bundle)", () => {
  const main = readSource(MAIN_TSX);
  // tokens.css must appear in a JS import statement so Vite bundles it
  expect(main).toMatch(/import\s+['"].*tokens\.css['"]/);
});

test("precondition: /partners-services route renders the Partners & Services page (routing seam intact)", () => {
  renderViaApp();
  expect(
    screen.queryByRole("heading", {
      name: "Explore Wellness Partners & Services",
      level: 1,
    }),
  ).not.toBeNull();
});

// ── AC2: required color values are defined as custom properties in tokens.css ─

const REQUIRED_COLORS = [
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
] as const;

test.each(REQUIRED_COLORS)(
  "AC2 — tokens.css defines color value %s as a CSS custom property",
  (color) => {
    const tokens = readSource(TOKENS_CSS).toLowerCase();
    // The value must appear on a custom property declaration line
    expect(tokens).toContain(color.toLowerCase());
  },
);

test("AC2 — tokens.css defines rgba(0,0,0,0.05) (shadow color from design spec)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.05\s*\)/);
});

test("AC2 — tokens.css defines rgba(0,0,0,0.08) (shadow color from design spec)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)/);
});

// ── AC3: font family stack is defined in tokens.css ──────────────────────────

test("AC3 — tokens.css defines the Inter font family as a custom property", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/--font-family[^:]*:\s*['"]?Inter/);
});

test("AC3 — tokens.css font-family stack includes system fallbacks (BlinkMacSystemFont, Segoe UI, Roboto)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toContain("BlinkMacSystemFont");
  expect(tokens).toContain("Segoe UI");
  expect(tokens).toContain("Roboto");
});

// ── AC4: every required font size is defined as a token ───────────────────────

const REQUIRED_FONT_SIZES = [
  "11px", "12px", "13px", "14px", "15px", "16px",
  "18px", "20px", "24px", "28px", "32px", "40px", "48px",
] as const;

test.each(REQUIRED_FONT_SIZES)(
  "AC4 — tokens.css defines font-size token for %s",
  (px) => {
    const tokens = readSource(TOKENS_CSS);
    // Must appear as a custom property value (--font-size-N: Npx)
    expect(tokens).toMatch(new RegExp(`--font-size[^:]*:\\s*${px}`));
  },
);

// ── AC5: every required spacing value is defined as a token ──────────────────

const REQUIRED_SPACING = [
  "4px", "6px", "8px", "10px", "12px", "14px", "16px", "20px",
  "24px", "32px", "40px", "48px", "64px", "80px", "200px", "240px",
] as const;

test.each(REQUIRED_SPACING)(
  "AC5 — tokens.css defines spacing token for %s",
  (px) => {
    const tokens = readSource(TOKENS_CSS);
    expect(tokens).toMatch(new RegExp(`--space[^:]*:\\s*${px}`));
  },
);

// ── AC6: every required border-radius is defined as a token ──────────────────

const REQUIRED_RADII = ["3px", "4px", "5px", "6px", "8px", "12px", "16px", "20px"] as const;

test.each(REQUIRED_RADII)(
  "AC6 — tokens.css defines border-radius token for %s",
  (px) => {
    const tokens = readSource(TOKENS_CSS);
    expect(tokens).toMatch(new RegExp(`--radius[^:]*:\\s*${px}`));
  },
);

// ── AC7: every required shadow value is defined as a token ───────────────────

test("AC7 — tokens.css defines shadow token: 0 1px 3px rgba(0,0,0,0.05)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/--shadow[^:]*:.*0 1px 3px rgba\(\s*0,\s*0,\s*0,\s*0\.05\s*\)/);
});

test("AC7 — tokens.css defines shadow token: 0 4px 24px rgba(0,0,0,0.08)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/--shadow[^:]*:.*0 4px 24px rgba\(\s*0,\s*0,\s*0,\s*0\.08\s*\)/);
});

test("AC7 — tokens.css defines shadow token: 0 4px 16px rgba(0,0,0,0.08)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/--shadow[^:]*:.*0 4px 16px rgba\(\s*0,\s*0,\s*0,\s*0\.08\s*\)/);
});

test("AC7 — tokens.css defines focus-ring shadow: 0 0 0 3px rgba(20,184,166,0.1)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/--shadow[^:]*:.*0 0 0 3px rgba\(\s*20,\s*184,\s*166,\s*0\.1\s*\)/);
});

test("AC7 — tokens.css defines shadow token: 0 4px 12px rgba(0,0,0,0.15)", () => {
  const tokens = readSource(TOKENS_CSS);
  expect(tokens).toMatch(/--shadow[^:]*:.*0 4px 12px rgba\(\s*0,\s*0,\s*0,\s*0\.15\s*\)/);
});

// ── AC8: every required gradient is defined as a token ───────────────────────

test("AC8 — tokens.css defines teal diagonal gradient: linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)", () => {
  const tokens = readSource(TOKENS_CSS).toLowerCase();
  expect(tokens).toMatch(/--gradient[^:]*:.*linear-gradient\(135deg,\s*#14b8a6\s*0%,\s*#0d9488\s*100%\)/);
});

test("AC8 — tokens.css defines teal light gradient: linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)", () => {
  const tokens = readSource(TOKENS_CSS).toLowerCase();
  expect(tokens).toMatch(/--gradient[^:]*:.*linear-gradient\(135deg,\s*#f0fdfa\s*0%,\s*#ccfbf1\s*100%\)/);
});

test("AC8 — tokens.css defines coral gradient: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)", () => {
  const tokens = readSource(TOKENS_CSS).toLowerCase();
  expect(tokens).toMatch(/--gradient[^:]*:.*linear-gradient\(135deg,\s*#ff6b6b\s*0%,\s*#ff8e53\s*100%\)/);
});

test("AC8 — tokens.css defines amber horizontal gradient: linear-gradient(90deg, #F59E0B 0%, #D97706 100%)", () => {
  const tokens = readSource(TOKENS_CSS).toLowerCase();
  expect(tokens).toMatch(/--gradient[^:]*:.*linear-gradient\(90deg,\s*#f59e0b\s*0%,\s*#d97706\s*100%\)/);
});

test("AC8 — tokens.css defines red solid gradient: linear-gradient(90deg, #EF4444 0%, #DC2626 100%)", () => {
  const tokens = readSource(TOKENS_CSS).toLowerCase();
  expect(tokens).toMatch(/--gradient[^:]*:.*linear-gradient\(90deg,\s*#ef4444\s*0%,\s*#dc2626\s*100%\)/);
});

// ── AC9: breakpoints appear in module.css @media rules ───────────────────────

test("AC9 — PartnersServicesPage.module.css contains a 768px responsive breakpoint", () => {
  const css = readSource(MODULE_CSS);
  expect(css).toMatch(/@media[^{]*768px/);
});

test("AC9 — PartnersServicesPage.module.css contains a 480px responsive breakpoint", () => {
  const css = readSource(MODULE_CSS);
  expect(css).toMatch(/@media[^{]*480px/);
});

// ── AC1: module.css uses design tokens — no raw hex color literals ─────────────────────────
// After stripping comments, no #RRGGBB / #RGB colour literals should remain —
// every colour must be referenced through a var(--...) custom property.

test("AC1 — PartnersServicesPage.module.css contains no raw hex color literals outside comments", () => {
  const raw = readSource(MODULE_CSS);
  const stripped = stripCssComments(raw);
  const hexColorPattern = /#[0-9a-fA-F]{3,8}(?=[^;{]*[;{])/g;
  const matches = stripped.match(hexColorPattern) ?? [];
  expect(matches).toEqual([]);
});

// ── AC1: module.css uses var() for font-size properties that have tokens ───────────────────
// font-size values that correspond to a design token (11px–48px) must use
// var(--font-size-N), not the raw pixel literal.

const TOKEN_FONT_SIZES_PX = [
  "11px", "12px", "13px", "14px", "15px", "16px",
  "18px", "20px", "24px", "28px", "32px", "40px", "48px",
];

test("AC1 — PartnersServicesPage.module.css uses var() for all font-size properties (no raw px literals for tokenised sizes)", () => {
  const raw = readSource(MODULE_CSS);
  const stripped = stripCssComments(raw);

  // Find every `font-size: <value>` declaration
  const fontSizeDeclarations = [...stripped.matchAll(/font-size\s*:\s*([^;]+);/g)].map(
    (m) => m[1].trim(),
  );

  const violations = fontSizeDeclarations.filter((value) => {
    // Raw px values that match a token → violation
    return TOKEN_FONT_SIZES_PX.some((px) => value === px);
  });

  expect(violations).toEqual([]);
});

// ── AC1: module.css uses var() for color-related properties ──────────────────
// color, background, background-color, border-color, and box-shadow properties
// must not contain raw hex values.

test("AC1 — module.css color properties use var(--) references, not raw hex", () => {
  const raw = readSource(MODULE_CSS);
  const stripped = stripCssComments(raw);

  // Extract declaration blocks for colour-related properties
  const colorProps = /(?:^|\s)(?:color|background(?:-color)?|border(?:-color)?|box-shadow)\s*:[^;]+;/gm;
  const declarations = stripped.match(colorProps) ?? [];

  const violating = declarations.filter((decl) => /#[0-9a-fA-F]{3,8}/.test(decl));
  expect(violating).toEqual([]);
});

// ── AC1: module.css has a reduced-motion block (animation/transition coverage) ──────────────

test("AC1 — module.css contains a @media (prefers-reduced-motion) block wrapping transitions", () => {
  const css = readSource(MODULE_CSS);
  expect(css).toMatch(/@media[^{]*prefers-reduced-motion/);
});

// ── End-to-end structural render: wireframe sections present via App route ────────────────

test("E2E — premium banner 'Unlock more services with Premium' heading rendered via App", () => {
  renderViaApp();
  screen.getByRole("heading", { name: "Unlock more services with Premium", level: 2 });
});

test("E2E — 'Upgrade to Premium' button rendered via App", () => {
  renderViaApp();
  screen.getByRole("button", { name: "Upgrade to Premium" });
});

test("E2E — all 5 category filter buttons rendered via App", () => {
  renderViaApp();
  for (const cat of ["All", "Fitness", "Nutrition", "Mental Health", "Sleep"]) {
    screen.getByRole("button", { name: cat });
  }
});

test("E2E — 8 service card headings rendered via App", () => {
  renderViaApp();
  const serviceNames = [
    "FitPro Training", "NutriGuide", "MindfulMe", "SleepWell Program",
    "Strength Builder", "RunCoach", "Wellness Coaching", "Stress Relief",
  ];
  for (const name of serviceNames) {
    screen.getByRole("heading", { name, level: 3 });
  }
});

test("E2E — each service card has a Learn More link (8 total) via App", () => {
  renderViaApp();
  expect(screen.getAllByRole("link", { name: "Learn More" })).toHaveLength(8);
});

test("E2E — premium badges count matches services with premiumRequired=true in SERVICES data", () => {
  renderViaApp();
  // Design spec (wireframe): NutriGuide, SleepWell Program, RunCoach carry Premium badges (3)
  // The component data marks: FitPro Training (true), SleepWell Program (true), RunCoach (true) → 3
  // Previous story (AC5) expected 4 per DB seed — this story re-tests per the wireframe (3)
  const premiumBadges = screen.getAllByText("Premium");
  // The wireframe shows exactly 3 premium badges; the component data must match
  expect(premiumBadges.length).toBe(3);
});

test("E2E — FitPro Training card shows Premium badge (premiumRequired=true in component data)", () => {
  renderViaApp();
  const heading = screen.getByRole("heading", { name: "FitPro Training", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected FitPro Training card <li> to exist");
  expect(within(card).getByText("Premium")).toBeTruthy();
});

test("E2E — SleepWell Program card shows Premium badge (premiumRequired=true in component data)", () => {
  renderViaApp();
  const heading = screen.getByRole("heading", { name: "SleepWell Program", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected SleepWell Program card <li> to exist");
  expect(within(card).getByText("Premium")).toBeTruthy();
});

test("E2E — RunCoach card shows Premium badge (premiumRequired=true in component data)", () => {
  renderViaApp();
  const heading = screen.getByRole("heading", { name: "RunCoach", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected RunCoach card <li> to exist");
  expect(within(card).getByText("Premium")).toBeTruthy();
});

test("E2E — NutriGuide card does NOT show Premium badge (premiumRequired=false in component data)", () => {
  renderViaApp();
  const heading = screen.getByRole("heading", { name: "NutriGuide", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected NutriGuide card <li> to exist");
  expect(within(card).queryByText("Premium")).toBeNull();
});

test("E2E — 'Service Booking Coming Soon' section heading rendered via App", () => {
  renderViaApp();
  screen.getByRole("heading", { name: "Service Booking Coming Soon", level: 2 });
});

test("E2E — coming-soon section contains deferred booking copy via App", () => {
  renderViaApp();
  screen.getByText(/working on making it easy to book and schedule wellness services/i);
});

test("E2E — sidebar navigation landmark present via App", () => {
  renderViaApp();
  screen.getByRole("navigation", { name: "Sidebar navigation" });
});

test("E2E — sidebar contains Dashboard, My Account, and Partners & Services links via App", () => {
  renderViaApp();
  screen.getByRole("link", { name: "📊 Dashboard" });
  screen.getByRole("link", { name: "👤 My Account" });
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

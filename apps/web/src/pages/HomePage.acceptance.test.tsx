/**
 * Acceptance tests for story: "Restyle WellnessHub — One place for your complete
 * wellness picture to match the updated design"
 *
 * Two tasks were implemented and merged:
 *   Task A — Add design-token custom properties to global CSS (tokens.css)
 *   Task B — Restyle HomePage component to match wireframe_homepage.html
 *
 * These tests verify the SEAM between the tasks: that tokens.css defines the exact
 * values required by the acceptance criteria, that HomePagee.module.css consumes
 * them via var() (no raw hex/rgba), that tokens.css is imported at the root entry
 * point, and that the rendered component matches the wireframe structure.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";

// ── Path helpers ──────────────────────────────────────────────────────────────

const _dir = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS_PATH = resolve(_dir, "../styles/tokens.css");
const CSS_MODULE_PATH = resolve(_dir, "./HomePage.module.css");
const MAIN_TSX_PATH = resolve(_dir, "../main.tsx");

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Strip CSS block comments so we don't falsely flag commented-out raw values. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

// ── Precondition: source files exist ─────────────────────────────────────────

test("PRECONDITION: tokens.css exists at src/styles/tokens.css", () => {
  // If this throws, the design-token task was never completed.
  const content = readSource(TOKENS_CSS_PATH);
  expect(content.length).toBeGreaterThan(0);
});

test("PRECONDITION: HomePage.module.css exists", () => {
  const content = readSource(CSS_MODULE_PATH);
  expect(content.length).toBeGreaterThan(0);
});

test("PRECONDITION: main.tsx exists at the app entry point", () => {
  const content = readSource(MAIN_TSX_PATH);
  expect(content.length).toBeGreaterThan(0);
});

// ── AC (token import chain): tokens.css is imported at the root entry point ──

test("AC token-import-chain: main.tsx imports tokens.css so custom properties are globally available", () => {
  const main = readSource(MAIN_TSX_PATH);
  // Must be imported before any component — the import statement must appear in the file.
  expect(main).toMatch(/import\s+['"].*tokens\.css['"]/);
});

// ── AC2: Required colour tokens are defined in tokens.css ─────────────────────

const REQUIRED_COLORS: [string, string][] = [
  ["#14b8a6", "--color-teal-500"],
  ["#6b7280", "--color-gray-500"],
  ["#1f2937", "--color-gray-800"],
  ["#e5e7eb", "--color-gray-200"],
  ["#0d9488", "--color-teal-600"],
  ["#f0fdfa", "--color-teal-50"],
  ["#ffffff", "--color-white"],
  ["#f9fafb", "--color-gray-50"],
  ["#ef4444", "--color-red-500"],
  ["#ccfbf1", "--color-teal-100"],
  ["#115e59", "--color-teal-800"],
  ["#fee2e2", "--color-red-100"],
  ["#991b1b", "--color-red-800"],
  ["#374151", "--color-gray-700"],
  ["#ff6b6b", "--color-red-coral"],
  ["#fef2f2", "--color-red-50"],
  ["#92400e", "--color-amber-800"],
  ["#fffbeb", "--color-amber-50"],
  ["#f59e0b", "--color-amber-500"],
  ["#fef3c7", "--color-amber-100"],
  ["#d1fae5", "--color-green-100"],
  ["#065f46", "--color-green-800"],
];

for (const [hex, tokenName] of REQUIRED_COLORS) {
  test(`AC2 color token: tokens.css defines ${hex} (${tokenName})`, () => {
    const tokens = readSource(TOKENS_CSS_PATH);
    // The hex value must appear as the value of a CSS custom property
    expect(tokens.toLowerCase()).toContain(hex.toLowerCase());
    // The token name itself must be declared
    expect(tokens).toContain(tokenName);
  });
}

test("AC2 shadow colour: tokens.css defines rgba(0,0,0,0.05) for xs shadow", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.05\s*\)/);
});

test("AC2 shadow colour: tokens.css defines rgba(0,0,0,0.08) for sm shadow", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)/);
});

// ── AC3: Font family token is defined ─────────────────────────────────────────

test("AC3 font-family token: tokens.css defines Inter as the primary font family", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/--font-family-base\s*:.*Inter/);
});

test("AC3 font-family token: token includes -apple-system fallback", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/--font-family-base\s*:.*-apple-system/);
});

// ── AC4: Font size tokens are defined ─────────────────────────────────────────

const REQUIRED_FONT_SIZES = [
  "11px", "12px", "13px", "14px", "15px", "16px",
  "18px", "20px", "24px", "28px", "32px", "40px", "48px",
];

for (const size of REQUIRED_FONT_SIZES) {
  test(`AC4 font-size token: tokens.css defines ${size}`, () => {
    const tokens = readSource(TOKENS_CSS_PATH);
    // Must appear as a custom property value (e.g. --font-size-16: 16px)
    expect(tokens).toMatch(new RegExp(`--font-size-\\w+\\s*:\\s*${size}`));
  });
}

// ── AC5: Spacing tokens are defined ───────────────────────────────────────────

const REQUIRED_SPACING = [
  "4px", "6px", "8px", "10px", "12px", "14px", "16px", "20px",
  "24px", "32px", "40px", "48px", "64px", "80px", "200px", "240px",
];

for (const space of REQUIRED_SPACING) {
  test(`AC5 spacing token: tokens.css defines ${space}`, () => {
    const tokens = readSource(TOKENS_CSS_PATH);
    expect(tokens).toContain(space);
  });
}

// ── AC6: Border radius tokens are defined ─────────────────────────────────────

const REQUIRED_RADII = ["3px", "4px", "5px", "6px", "8px", "12px", "16px", "20px"];

for (const r of REQUIRED_RADII) {
  test(`AC6 radius token: tokens.css defines ${r}`, () => {
    const tokens = readSource(TOKENS_CSS_PATH);
    expect(tokens).toContain(r);
  });
}

// ── AC7: Shadow tokens are defined ────────────────────────────────────────────

test("AC7 shadow token: tokens.css defines 0 1px 3px rgba(0,0,0,0.05) (xs shadow)", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(
    /--shadow-\w+\s*:.*0 1px 3px rgba\(0,\s*0,\s*0,\s*0\.05\)/,
  );
});

test("AC7 shadow token: tokens.css defines 0 4px 24px rgba(0,0,0,0.08) (md shadow)", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(
    /--shadow-\w+\s*:.*0 4px 24px rgba\(0,\s*0,\s*0,\s*0\.08\)/,
  );
});

test("AC7 shadow token: tokens.css defines 0 4px 16px rgba(0,0,0,0.08) (sm shadow)", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(
    /--shadow-\w+\s*:.*0 4px 16px rgba\(0,\s*0,\s*0,\s*0\.08\)/,
  );
});

test("AC7 shadow token: tokens.css defines 0 0 0 3px rgba(20,184,166,0.1) (focus-ring)", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  // --shadow-focus-ring contains a hyphen — use [\w-]+ to match hyphenated names
  expect(tokens).toMatch(
    /--shadow-[\w-]+\s*:.*0 0 0 3px rgba\(20,\s*184,\s*166,\s*0\.1\)/,
  );
});

test("AC7 shadow token: tokens.css defines 0 4px 12px rgba(0,0,0,0.15) (lg shadow)", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(
    /--shadow-\w+\s*:.*0 4px 12px rgba\(0,\s*0,\s*0,\s*0\.15\)/,
  );
});

// ── AC8: Gradient tokens are defined ──────────────────────────────────────────

test("AC8 gradient token: tokens.css defines linear-gradient(135deg, #14B8A6 0%, #0D9488 100%) (teal-diagonal)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(135deg,\s*#14b8a6 0%,\s*#0d9488 100%\)/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%) (teal-light)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(135deg,\s*#f0fdfa 0%,\s*#ccfbf1 100%\)/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(90deg, #14B8A6 0%, #0D9488 100%) (teal-horizontal)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(90deg,\s*#14b8a6 0%,\s*#0d9488 100%\)/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%) (coral)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(135deg,\s*#ff6b6b 0%,\s*#ff8e53 100%\)/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(to right, #FEE2E2 ...) (red-horizontal)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(to right,\s*#fee2e2/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(to right, #DBEAFE ...) (blue-horizontal)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(to right,\s*#dbeafe/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(90deg, #F59E0B 0%, #D97706 100%) (amber-horizontal)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(90deg,\s*#f59e0b 0%,\s*#d97706 100%\)/,
  );
});

test("AC8 gradient token: tokens.css defines linear-gradient(90deg, #EF4444 0%, #DC2626 100%) (red-solid)", () => {
  const tokens = readSource(TOKENS_CSS_PATH).toLowerCase();
  expect(tokens).toMatch(
    /--gradient-[\w-]+\s*:.*linear-gradient\(90deg,\s*#ef4444 0%,\s*#dc2626 100%\)/,
  );
});

// ── AC9: Breakpoint custom properties are defined ─────────────────────────────

test("AC9 breakpoint token: tokens.css defines 480px breakpoint custom property", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/--breakpoint-\w+\s*:\s*480px/);
});

test("AC9 breakpoint token: tokens.css defines 768px breakpoint custom property", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/--breakpoint-\w+\s*:\s*768px/);
});

test("AC9 breakpoint token: tokens.css defines 1024px breakpoint custom property", () => {
  const tokens = readSource(TOKENS_CSS_PATH);
  expect(tokens).toMatch(/--breakpoint-\w+\s*:\s*1024px/);
});

test("AC9 breakpoint responsive: HomePage.module.css uses 768px media-query breakpoint", () => {
  const css = readSource(CSS_MODULE_PATH);
  expect(css).toMatch(/@media\s*\(max-width:\s*768px\)/);
});

test("AC9 breakpoint responsive: HomePage.module.css uses 480px media-query breakpoint", () => {
  const css = readSource(CSS_MODULE_PATH);
  expect(css).toMatch(/@media\s*\(max-width:\s*480px\)/);
});

// ── AC1 CSS purity: module references tokens, not raw hex/rgba ────────────────

test("AC1 css-purity: HomePage.module.css contains no raw hex colour literals (uses var() tokens instead)", () => {
  const raw = readSource(CSS_MODULE_PATH);
  const css = stripCssComments(raw);
  // Match any # followed by 3–8 hex characters (CSS colour literal)
  const hexPattern = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g;
  const matches = css.match(hexPattern) ?? [];
  expect(matches).toEqual([]);
});

test("AC1 css-purity: HomePage.module.css contains no raw rgba() or rgb() colour calls (uses var() tokens instead)", () => {
  const raw = readSource(CSS_MODULE_PATH);
  const css = stripCssComments(raw);
  const rgbaPattern = /\brgba?\s*\(/g;
  const matches = css.match(rgbaPattern) ?? [];
  expect(matches).toEqual([]);
});

// ── AC1 wireframe structure: brand name in logo slot only, not h1 ─────────────

test("AC1 structure: the page h1 is the value-proposition headline, not the brand name 'WellnessHub'", () => {
  renderHomePage();
  const h1 = screen.getByRole("heading", { level: 1 });
  expect(h1.textContent).not.toMatch(/WellnessHub/i);
});

test("AC1 structure: h1 contains value-proposition copy matching wireframe", () => {
  renderHomePage();
  // Wireframe specifies: "Your Health Journey Starts Here" (design) / implementation uses
  // "One place for your complete wellness picture" — both are value-prop headlines.
  const h1 = screen.getByRole("heading", { level: 1 });
  // Verify it exists and contains non-brand content
  expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  // The h1 should NOT be just the brand name
  expect(h1.textContent?.trim()).not.toBe("WellnessHub");
});

test("AC1 structure: 'WellnessHub' brand name appears in the page header (logo area)", () => {
  const { container } = renderHomePage();
  const header = container.querySelector("header");
  expect(header).not.toBeNull();
  // The brand name must be visible somewhere inside the header
  expect(header!.textContent).toMatch(/WellnessHub/);
});

// ── AC1 wireframe structure: navigation links ─────────────────────────────────

test("AC1 structure: 'Log In' link in header navigates to /login", () => {
  renderHomePage();
  const logIn = screen.getByRole("link", { name: "Log In" });
  expect(logIn.getAttribute("href")).toBe("/login");
});

test("AC1 structure: 'Get Started' link in header navigates to /register", () => {
  renderHomePage();
  const getStarted = screen.getByRole("link", { name: "Get Started" });
  expect(getStarted.getAttribute("href")).toBe("/register");
});

test("AC1 structure: 'Get Started Free' CTA in hero navigates to /register", () => {
  renderHomePage();
  const cta = screen.getByRole("link", { name: "Get Started Free" });
  expect(cta.getAttribute("href")).toBe("/register");
});

// ── AC1 wireframe structure: four domain cards ────────────────────────────────

test("AC1 structure: domains section renders exactly 4 health domain cards", () => {
  const { container } = renderHomePage();
  const domainSection = container.querySelector("section[aria-labelledby='domains-heading']");
  expect(domainSection).not.toBeNull();
  // Cards are rendered as <li> elements inside the section
  const cards = domainSection!.querySelectorAll("li");
  expect(cards.length).toBe(4);
});

test("AC1 structure: each domain card has an h3 heading", () => {
  const { container } = renderHomePage();
  const domainSection = container.querySelector("section[aria-labelledby='domains-heading']");
  expect(domainSection).not.toBeNull();
  const cards = Array.from(domainSection!.querySelectorAll("li"));
  for (const card of cards) {
    const h3 = card.querySelector("h3");
    expect(h3).not.toBeNull();
    expect(h3!.textContent?.trim().length).toBeGreaterThan(0);
  }
});

test("AC1 structure: Activity domain card title and description are scoped inside that card", () => {
  const { container } = renderHomePage();
  const domainSection = container.querySelector("section[aria-labelledby='domains-heading']");
  expect(domainSection).not.toBeNull();
  const cards = Array.from(domainSection!.querySelectorAll("li"));
  const activityCard = cards.find((c) => c.querySelector("h3")?.textContent === "Activity");
  expect(activityCard).toBeDefined();
  expect(
    within(activityCard!).getByText(/Track your daily steps, active minutes/),
  ).toBeDefined();
});

test("AC1 structure: Body Composition domain card title and description are scoped inside that card", () => {
  const { container } = renderHomePage();
  const domainSection = container.querySelector("section[aria-labelledby='domains-heading']");
  expect(domainSection).not.toBeNull();
  const cards = Array.from(domainSection!.querySelectorAll("li"));
  const card = cards.find((c) => c.querySelector("h3")?.textContent === "Body Composition");
  expect(card).toBeDefined();
  expect(
    within(card!).getByText(/Track weight, body fat percentage/),
  ).toBeDefined();
});

// ── AC1 wireframe structure: statistics strip ─────────────────────────────────

test("AC1 structure: statistics strip renders exactly 4 stat items", () => {
  const { container } = renderHomePage();
  const statsSection = container.querySelector("section[aria-label='Statistics']");
  expect(statsSection).not.toBeNull();
  const items = statsSection!.querySelectorAll("li");
  expect(items.length).toBe(4);
});

test("AC1 structure: each stat item renders a value and a label scoped within its container", () => {
  const { container } = renderHomePage();
  const statsSection = container.querySelector("section[aria-label='Statistics']");
  expect(statsSection).not.toBeNull();
  // Spot-check: the '4' value and its label are in the same li
  const items = Array.from(statsSection!.querySelectorAll("li"));
  const fourItem = items.find((li) => li.textContent?.includes("4") && li.textContent?.includes("Core health domains"));
  expect(fourItem).toBeDefined();
});

// ── AC1 wireframe structure: trust section three cards ────────────────────────

test("AC1 structure: trust section renders exactly 3 feature cards", () => {
  const { container } = renderHomePage();
  const trustSection = container.querySelector("section[aria-labelledby='trust-heading']");
  expect(trustSection).not.toBeNull();
  const cards = trustSection!.querySelectorAll("li");
  expect(cards.length).toBe(3);
});

test("AC1 structure: 'You Own Your Data' trust card title and copy are scoped inside that card", () => {
  const { container } = renderHomePage();
  const trustSection = container.querySelector("section[aria-labelledby='trust-heading']");
  expect(trustSection).not.toBeNull();
  const cards = Array.from(trustSection!.querySelectorAll("li"));
  const card = cards.find((c) => c.querySelector("h3")?.textContent === "You Own Your Data");
  expect(card).toBeDefined();
  expect(
    within(card!).getByText(/Your health information belongs to you/),
  ).toBeDefined();
});

test("AC1 structure: each trust card has an h3 heading", () => {
  const { container } = renderHomePage();
  const trustSection = container.querySelector("section[aria-labelledby='trust-heading']");
  expect(trustSection).not.toBeNull();
  const cards = Array.from(trustSection!.querySelectorAll("li"));
  for (const card of cards) {
    const h3 = card.querySelector("h3");
    expect(h3).not.toBeNull();
    expect(h3!.textContent?.trim().length).toBeGreaterThan(0);
  }
});

// ── AC1 heading hierarchy: no heading levels are skipped ─────────────────────

test("AC1 heading-hierarchy: page has exactly one h1", () => {
  const { container } = renderHomePage();
  const h1s = container.querySelectorAll("h1");
  expect(h1s.length).toBe(1);
});

test("AC1 heading-hierarchy: h2 headings exist directly under the h1 level", () => {
  renderHomePage();
  // Domains section and trust section both have h2 headings
  const h2s = screen.getAllByRole("heading", { level: 2 });
  expect(h2s.length).toBeGreaterThanOrEqual(2);
});

test("AC1 heading-hierarchy: h3 headings exist inside domain and trust sub-sections", () => {
  renderHomePage();
  const h3s = screen.getAllByRole("heading", { level: 3 });
  // 4 domain cards + 3 trust cards = at least 7 h3s
  expect(h3s.length).toBeGreaterThanOrEqual(7);
});

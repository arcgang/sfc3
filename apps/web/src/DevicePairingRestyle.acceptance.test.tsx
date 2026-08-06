/**
 * Acceptance tests — "Restyle Connect Your Devices to match the updated design"
 *
 * These tests exercise the SEAM between the two styling tasks:
 *   - Token task: "Audit and extend design tokens in index.css/tokens.css to cover
 *                  all wireframe_device_pairing values"
 *   - Restyle task: "Restyle DevicePairingPage.module.css using design tokens only"
 *
 * Existing tests already cover:
 *   - DevicePairingPage.test.tsx  — page content and connect flow (unit)
 *   - DevicePairing.acceptance.test.tsx — routing seam, providers, skip link
 *
 * This file covers the STYLING seam that nothing else tests:
 *
 *   SEAM A — Token definitions: tokens.css contains every wireframe design value
 *             (colors, fonts, font sizes, spacing, radii, shadows, gradients)
 *
 *   SEAM B — No raw hex: DevicePairingPage.module.css uses only var(--…) for
 *             colour values — no hardcoded hex literals that bypass the token system
 *
 *   SEAM C — Token-CSS bridge: every var(--…) referenced in the module CSS is
 *             actually defined in tokens.css or index.css (task 1 ↔ task 2 join)
 *
 *   SEAM D — Responsive breakpoints: the module CSS has @media queries at all
 *             three wireframe breakpoints (480px, 768px, 1024px)
 *
 *   SEAM E — Wireframe structure end-to-end: the restyled page still renders every
 *             structural element specified in wireframe_device_pairing.html
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKENS_CSS_PATH = resolve(__dirname, "styles/tokens.css");
const INDEX_CSS_PATH = resolve(__dirname, "index.css");
const MODULE_CSS_PATH = resolve(__dirname, "pages/DevicePairingPage.module.css");

// ── apiFetch mock — DevicePairingPage makes no calls on mount; mock resolves ──
vi.mock("./api.js", () => ({
  apiFetch: () => Promise.resolve({}),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// ── Helper: read CSS file content (cached per test run) ──────────────────────

function readCss(path: string): string {
  return readFileSync(path, "utf-8");
}

// ── Preconditions: all CSS files exist and are readable ──────────────────────

test("precondition — src/styles/tokens.css exists and is non-empty", () => {
  const content = readCss(TOKENS_CSS_PATH);
  expect(content.length).toBeGreaterThan(200);
});

test("precondition — src/index.css exists and is non-empty", () => {
  const content = readCss(INDEX_CSS_PATH);
  expect(content.length).toBeGreaterThan(200);
});

test("precondition — DevicePairingPage.module.css exists and is non-empty", () => {
  const content = readCss(MODULE_CSS_PATH);
  expect(content.length).toBeGreaterThan(200);
});

// ── SEAM A — Criterion 2: all wireframe hex colors defined in tokens.css ──────

const WIREFRAME_COLORS: string[] = [
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

test.each(WIREFRAME_COLORS)(
  "AC2 — tokens.css defines a design token whose value is %s",
  (hex) => {
    const content = readCss(TOKENS_CSS_PATH).toLowerCase();
    expect(content).toContain(hex.toLowerCase());
  },
);

// ── SEAM A — Criterion 3: Inter font family token ─────────────────────────────

test("AC3 — tokens.css defines the Inter font-family token", () => {
  const content = readCss(TOKENS_CSS_PATH);
  expect(content).toContain("Inter");
  expect(content).toContain("-apple-system");
  expect(content).toContain("BlinkMacSystemFont");
});

// ── SEAM A — Criterion 4: all wireframe font sizes defined ────────────────────

const WIREFRAME_FONT_SIZES: string[] = [
  "11px", "12px", "13px", "14px", "15px", "16px",
  "18px", "20px", "24px", "28px", "32px", "40px", "48px",
];

test.each(WIREFRAME_FONT_SIZES)(
  "AC4 — tokens.css defines a font-size token for %s",
  (size) => {
    const content = readCss(TOKENS_CSS_PATH);
    expect(content).toContain(size);
  },
);

// ── SEAM A — Criterion 5: all wireframe spacing values defined ────────────────

const WIREFRAME_SPACINGS: string[] = [
  "4px", "6px", "8px", "10px", "12px", "14px", "16px", "20px",
  "24px", "32px", "40px", "48px", "64px", "80px", "200px", "240px",
];

test.each(WIREFRAME_SPACINGS)(
  "AC5 — tokens.css defines a spacing token for %s",
  (spacing) => {
    const content = readCss(TOKENS_CSS_PATH);
    expect(content).toContain(spacing);
  },
);

// ── SEAM A — Criterion 6: all wireframe radius values defined ─────────────────

const WIREFRAME_RADII: string[] = [
  "3px", "4px", "5px", "6px", "8px", "12px", "16px", "20px",
];

test.each(WIREFRAME_RADII)(
  "AC6 — tokens.css defines a border-radius token for %s",
  (radius) => {
    const content = readCss(TOKENS_CSS_PATH);
    expect(content).toContain(radius);
  },
);

// ── SEAM A — Criterion 7: all wireframe shadows defined ───────────────────────

test("AC7 — tokens.css defines the '0 1px 3px rgba(0, 0, 0, 0.05)' shadow token", () => {
  expect(readCss(TOKENS_CSS_PATH)).toContain("0 1px 3px rgba(0, 0, 0, 0.05)");
});

test("AC7 — tokens.css defines the '0 4px 24px rgba(0, 0, 0, 0.08)' shadow token", () => {
  expect(readCss(TOKENS_CSS_PATH)).toContain("0 4px 24px rgba(0, 0, 0, 0.08)");
});

test("AC7 — tokens.css defines the '0 4px 16px rgba(0, 0, 0, 0.08)' shadow token", () => {
  expect(readCss(TOKENS_CSS_PATH)).toContain("0 4px 16px rgba(0, 0, 0, 0.08)");
});

test("AC7 — tokens.css defines the '0 0 0 3px rgba(20, 184, 166, 0.1)' focus-ring shadow token", () => {
  expect(readCss(TOKENS_CSS_PATH)).toContain("0 0 0 3px rgba(20, 184, 166, 0.1)");
});

test("AC7 — tokens.css defines the '0 4px 12px rgba(0, 0, 0, 0.15)' shadow token", () => {
  expect(readCss(TOKENS_CSS_PATH)).toContain("0 4px 12px rgba(0, 0, 0, 0.15)");
});

// ── SEAM A — Criterion 8: all wireframe gradients defined ─────────────────────

test("AC8 — tokens.css defines the diagonal teal gradient 'linear-gradient(135deg, #14b8a6 …)'", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("linear-gradient(135deg, #14b8a6");
});

test("AC8 — tokens.css defines the light teal gradient from #f0fdfa to #ccfbf1", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  // The gradient is linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)
  expect(content).toContain("#f0fdfa 0%, #ccfbf1 100%");
});

test("AC8 — tokens.css defines the horizontal teal gradient 'linear-gradient(90deg, #14b8a6 …)'", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("linear-gradient(90deg, #14b8a6");
});

test("AC8 — tokens.css defines the coral gradient 'linear-gradient(135deg, #ff6b6b …)'", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("linear-gradient(135deg, #ff6b6b");
});

test("AC8 — tokens.css defines the amber horizontal gradient 'linear-gradient(90deg, #f59e0b …)'", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("linear-gradient(90deg, #f59e0b");
});

test("AC8 — tokens.css defines the red solid gradient 'linear-gradient(90deg, #ef4444 …)'", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("linear-gradient(90deg, #ef4444");
});

// ── SEAM B — Criterion 1: no raw hex colour literals in module CSS ────────────

test("AC1/SEAM B — DevicePairingPage.module.css contains no raw hex colour values", () => {
  const raw = readCss(MODULE_CSS_PATH);
  // Strip block comments before scanning, to avoid matching colours in docs
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const rawHexMatches = withoutComments.match(/#[0-9a-fA-F]{3,8}/g);
  // Expect null (no matches), providing the found list as the error message
  expect(rawHexMatches).toBeNull();
});

// ── SEAM C — Token-CSS bridge: every var(--…) in module CSS is defined ────────

test("AC1/SEAM C — every var(--…) referenced in DevicePairingPage.module.css is defined in tokens.css or index.css", () => {
  const rawModuleContent = readCss(MODULE_CSS_PATH);
  // Strip CSS block comments before scanning so doc-comments like
  // "/* … all values are var(--…) references */" do not produce false matches.
  const moduleContent = rawModuleContent.replace(/\/\*[\s\S]*?\*\//g, "");
  const allDefinitions = readCss(TOKENS_CSS_PATH) + readCss(INDEX_CSS_PATH);

  // Extract all token names referenced as var(--token-name)
  const referencedTokens = [...moduleContent.matchAll(/var\(--([^),\s]+)/g)].map(
    (m) => m[1]!,
  );

  const undefinedTokens = referencedTokens.filter(
    (token) => !allDefinitions.includes(`--${token}:`),
  );

  // Report exactly which tokens are missing so test output is actionable
  expect(undefinedTokens).toEqual([]);
});

// ── SEAM D — Criterion 9: responsive breakpoints present in module CSS ────────

test("AC9 — DevicePairingPage.module.css has @media (max-width: 480px) breakpoint", () => {
  expect(readCss(MODULE_CSS_PATH)).toContain("max-width: 480px");
});

test("AC9 — DevicePairingPage.module.css has @media (max-width: 768px) breakpoint", () => {
  expect(readCss(MODULE_CSS_PATH)).toContain("max-width: 768px");
});

test("AC9 — DevicePairingPage.module.css has @media (max-width: 1024px) breakpoint", () => {
  expect(readCss(MODULE_CSS_PATH)).toContain("max-width: 1024px");
});

// ── SEAM E — Wireframe structure rendered end-to-end via App routing ──────────
// These verify criterion 1: the restyle preserved all wireframe structural
// elements accessible through the /devices/pair App route.

test("AC1/SEAM E — /devices/pair route renders h1 'Connect Your Devices'", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

test("AC1/SEAM E — WellnessHub logo text is rendered on the pairing page", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  // The pairing page renders its own logo; a footer also contains WellnessHub.
  // Use getAllByText and assert at least one instance is present.
  const instances = screen.getAllByText("WellnessHub");
  expect(instances.length).toBeGreaterThanOrEqual(1);
});

test("AC1/SEAM E — 'Smartwatch' device-type card heading (h3) is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Smartwatch", level: 3 });
});

test("AC1/SEAM E — 'Smart Scale' device-type card heading (h3) is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Smart Scale", level: 3 });
});

test("AC1/SEAM E — 'Connect Smartwatch' button is rendered inside the Smartwatch card", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("button", { name: "Connect Smartwatch" });
});

test("AC1/SEAM E — 'Connect Smart Scale' button is rendered inside the Smart Scale card", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("button", { name: "Connect Smart Scale" });
});

test("AC1/SEAM E — 'Select Your Device Provider' section heading (h2) is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Select Your Device Provider", level: 2 });
});

test("AC1/SEAM E — all four provider headings are rendered (Fitbit, Apple Watch, Garmin, Withings)", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Fitbit", level: 3 });
  screen.getByRole("heading", { name: "Apple Watch", level: 3 });
  screen.getByRole("heading", { name: "Garmin", level: 3 });
  screen.getByRole("heading", { name: "Withings", level: 3 });
});

test("AC1/SEAM E — 'Connection Steps' section heading (h2) is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Connection Steps", level: 2 });
});

test("AC1/SEAM E — first connection step text 'Click \"Authorize\"…' is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByText(/Click "Authorize" to grant WellnessHub access/);
});

test("AC1/SEAM E — 'Skip for now' navigation link is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("link", { name: "Skip for now" });
});

test("AC1/SEAM E — 'Continue to Dashboard' navigation link is rendered", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  screen.getByRole("link", { name: "Continue to Dashboard" });
});

// ── SEAM A — Criterion 8 (remaining gradients): red-horizontal and blue-horizontal

test("AC8 — tokens.css defines the red horizontal gradient with #fee2e2, #fecaca, #fca5a5", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("#fee2e2");
  expect(content).toContain("#fecaca");
  expect(content).toContain("#fca5a5");
});

test("AC8 — tokens.css defines the blue horizontal gradient with #dbeafe, #bfdbfe, #93c5fd", () => {
  const content = readCss(TOKENS_CSS_PATH).toLowerCase();
  expect(content).toContain("#dbeafe");
  expect(content).toContain("#bfdbfe");
  expect(content).toContain("#93c5fd");
});

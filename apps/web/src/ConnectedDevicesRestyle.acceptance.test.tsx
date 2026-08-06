/**
 * Acceptance tests — story: "Restyle Connected Devices - WellnessHub to match the updated design"
 *
 * What no existing test covers (the seam between the two tasks):
 *   - tokens.css defines every required design-token value (criteria 2–9)
 *   - ConnectedDevicesPage.module.css contains no raw hex/px colour values (criterion 1)
 *   - Every CSS custom property referenced via var() in the CSS module is actually
 *     defined in tokens.css (seam: restyle task depends on design-token task)
 *   - tokens.css is imported from the global entry point so tokens are available at runtime
 *   - The component renders with the CSS class names that carry the token-driven styling
 *
 * A failing test here means the story's acceptance criterion is not met on this code.
 * Do NOT modify production code to fix a failure — report the gap instead.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { ConnectedDevicesPage } from "./pages/ConnectedDevicesPage.js";

vi.mock("./api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { apiFetch } from "./api.js";
const mockApiFetch = vi.mocked(apiFetch);

// ── Resolve CSS file paths ────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS_PATH = resolve(HERE, "styles/tokens.css");
const MODULE_CSS_PATH = resolve(HERE, "pages/ConnectedDevicesPage.module.css");
const INDEX_CSS_PATH = resolve(HERE, "index.css");
const MAIN_TSX_PATH = resolve(HERE, "main.tsx");

function readCss(p: string): string {
  return readFileSync(p, "utf-8");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract every "--name" from var(--name[, ...]) occurrences in CSS text. */
function extractVarRefs(css: string): Set<string> {
  const refs = new Set<string>();
  const re = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    refs.add(m[1]);
  }
  return refs;
}

/** Extract every "--name" that is *defined* (has a : value) in CSS text. */
function extractDefinedTokens(css: string): Set<string> {
  const defs = new Set<string>();
  const re = /(--[a-zA-Z0-9_-]+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    defs.add(m[1]);
  }
  return defs;
}

function makeResponse(devices: unknown[]) {
  return {
    meta: { correlationId: "acc-restyle-cid", timestamp: new Date().toISOString() },
    data: { devices },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// PRECONDITIONS — these must pass before any behavioural assertion is meaningful
// ══════════════════════════════════════════════════════════════════════════════

test("precondition: tokens.css exists at src/styles/tokens.css", () => {
  expect(existsSync(TOKENS_CSS_PATH)).toBe(true);
});

test("precondition: ConnectedDevicesPage.module.css exists at src/pages/ConnectedDevicesPage.module.css", () => {
  expect(existsSync(MODULE_CSS_PATH)).toBe(true);
});

test("precondition: index.css exists at src/index.css", () => {
  expect(existsSync(INDEX_CSS_PATH)).toBe(true);
});

// ── Criterion 1 (tokens globally available): tokens.css imported in entry point

test("criterion 1 — index.css imports tokens.css so design tokens are available globally", () => {
  const indexCss = readCss(INDEX_CSS_PATH);
  // tokens.css must be in an @import rule at the global stylesheet entry
  expect(indexCss).toMatch(/@import\s+["'].*tokens\.css["']/);
});

test("criterion 1 — main.tsx also imports tokens.css directly ensuring tokens load before components", () => {
  const main = readFileSync(MAIN_TSX_PATH, "utf-8");
  // main.tsx must reference tokens.css in an import statement
  expect(main).toContain("tokens.css");
});

// ── Criterion 1 (no raw hardcoded hex colours in the CSS module)

test("criterion 1 — ConnectedDevicesPage.module.css contains no raw hex colour literals", () => {
  const css = readCss(MODULE_CSS_PATH);
  // Strip comment lines to avoid false-positives from the contrast-ratio comment
  const strippedComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rawHex = strippedComments.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  expect(rawHex).toEqual([]);
});

// ── Criterion 1 (seam): every var(--token) reference must be defined in tokens.css

test("criterion 1 (seam) — every custom property referenced in ConnectedDevicesPage.module.css is defined in tokens.css", () => {
  const moduleCss = readCss(MODULE_CSS_PATH);
  const tokensCss = readCss(TOKENS_CSS_PATH);

  const refs = extractVarRefs(moduleCss);
  const defs = extractDefinedTokens(tokensCss);

  const undefined_tokens = [...refs].filter((r) => !defs.has(r));
  expect(undefined_tokens).toEqual(
    [],
    // Report which tokens are missing so the finding is actionable
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 2 — All required colour values are represented in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_COLORS: Array<{ token: string; hex: string }> = [
  { token: "--color-teal-500",    hex: "#14b8a6" },
  { token: "--color-gray-500",    hex: "#6b7280" },
  { token: "--color-gray-800",    hex: "#1f2937" },
  { token: "--color-gray-200",    hex: "#e5e7eb" },
  { token: "--color-teal-600",    hex: "#0d9488" },
  { token: "--color-teal-50",     hex: "#f0fdfa" },
  { token: "--color-white",       hex: "#ffffff" },
  { token: "--color-gray-50",     hex: "#f9fafb" },
  { token: "--color-red-500",     hex: "#ef4444" },
  { token: "--color-teal-100",    hex: "#ccfbf1" },
  { token: "--color-teal-800",    hex: "#115e59" },
  { token: "--color-red-100",     hex: "#fee2e2" },
  { token: "--color-red-800",     hex: "#991b1b" },
  { token: "--color-gray-700",    hex: "#374151" },
  { token: "--color-red-coral",   hex: "#ff6b6b" },
  { token: "--color-red-50",      hex: "#fef2f2" },
  { token: "--color-amber-800",   hex: "#92400e" },
  { token: "--color-amber-50",    hex: "#fffbeb" },
  { token: "--color-amber-500",   hex: "#f59e0b" },
  { token: "--color-amber-100",   hex: "#fef3c7" },
  { token: "--color-green-100",   hex: "#d1fae5" },
  // #065f46 appears as both --color-teal-900 and --color-green-800
  { token: "--color-teal-900",    hex: "#065f46" },
];

for (const { token, hex } of REQUIRED_COLORS) {
  test(`criterion 2 — tokens.css defines ${token}: ${hex}`, () => {
    const css = readCss(TOKENS_CSS_PATH);
    // The token name must be declared with the correct hex value
    const pattern = new RegExp(
      token.replace(/[-]/g, "\\-") + "\\s*:\\s*" + hex.replace(/#/g, "\\#"),
    );
    expect(css).toMatch(pattern);
  });
}

// rgba values in the required color list

test("criterion 2 — tokens.css defines rgba(0, 0, 0, 0.05) for --color-shadow-xs", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toContain("rgba(0, 0, 0, 0.05)");
  expect(css).toMatch(/--color-shadow-xs\s*:\s*rgba\(0,\s*0,\s*0,\s*0\.05\)/);
});

test("criterion 2 — tokens.css defines rgba(0, 0, 0, 0.08) for --color-shadow-sm", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toContain("rgba(0, 0, 0, 0.08)");
  expect(css).toMatch(/--color-shadow-sm\s*:\s*rgba\(0,\s*0,\s*0,\s*0\.08\)/);
});

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 3 — Font family defined in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

test("criterion 3 — tokens.css defines --font-family-base containing Inter", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--font-family-base\s*:.*Inter/);
});

test("criterion 3 — --font-family-base includes -apple-system and BlinkMacSystemFont fallbacks", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--font-family-base\s*:.*-apple-system/);
  expect(css).toMatch(/--font-family-base\s*:[\s\S]*?BlinkMacSystemFont/);
});

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 4 — All required font-size tokens defined in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_FONT_SIZES: Array<{ token: string; value: string }> = [
  { token: "--font-size-11", value: "11px" },
  { token: "--font-size-12", value: "12px" },
  { token: "--font-size-13", value: "13px" },
  { token: "--font-size-14", value: "14px" },
  { token: "--font-size-15", value: "15px" },
  { token: "--font-size-16", value: "16px" },
  { token: "--font-size-18", value: "18px" },
  { token: "--font-size-20", value: "20px" },
  { token: "--font-size-24", value: "24px" },
  { token: "--font-size-28", value: "28px" },
  { token: "--font-size-32", value: "32px" },
  { token: "--font-size-40", value: "40px" },
  { token: "--font-size-48", value: "48px" },
];

for (const { token, value } of REQUIRED_FONT_SIZES) {
  test(`criterion 4 — tokens.css defines ${token}: ${value}`, () => {
    const css = readCss(TOKENS_CSS_PATH);
    const pattern = new RegExp(
      token.replace(/[-]/g, "\\-") + "\\s*:\\s*" + value,
    );
    expect(css).toMatch(pattern);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 5 — All required spacing tokens defined in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_SPACING: Array<{ token: string; value: string }> = [
  { token: "--space-1",            value: "4px" },
  { token: "--space-2",            value: "6px" },
  { token: "--space-3",            value: "8px" },
  { token: "--space-4",            value: "10px" },
  { token: "--space-5",            value: "12px" },
  { token: "--space-6",            value: "14px" },
  { token: "--space-7",            value: "16px" },
  { token: "--space-8",            value: "20px" },
  { token: "--space-9",            value: "24px" },
  { token: "--space-10",           value: "32px" },
  { token: "--space-11",           value: "40px" },
  { token: "--space-12",           value: "48px" },
  { token: "--space-13",           value: "64px" },
  { token: "--space-14",           value: "80px" },
  { token: "--space-sidebar",      value: "200px" },
  { token: "--space-sidebar-wide", value: "240px" },
];

for (const { token, value } of REQUIRED_SPACING) {
  test(`criterion 5 — tokens.css defines ${token}: ${value}`, () => {
    const css = readCss(TOKENS_CSS_PATH);
    const pattern = new RegExp(
      token.replace(/[-]/g, "\\-") + "\\s*:\\s*" + value,
    );
    expect(css).toMatch(pattern);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 6 — All required border-radius tokens defined in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_RADII: Array<{ token: string; value: string }> = [
  { token: "--radius-1", value: "3px" },
  { token: "--radius-2", value: "4px" },
  { token: "--radius-3", value: "5px" },
  { token: "--radius-4", value: "6px" },
  { token: "--radius-5", value: "8px" },
  { token: "--radius-6", value: "12px" },
  { token: "--radius-7", value: "16px" },
  { token: "--radius-8", value: "20px" },
];

for (const { token, value } of REQUIRED_RADII) {
  test(`criterion 6 — tokens.css defines ${token}: ${value}`, () => {
    const css = readCss(TOKENS_CSS_PATH);
    const pattern = new RegExp(
      token.replace(/[-]/g, "\\-") + "\\s*:\\s*" + value,
    );
    expect(css).toMatch(pattern);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 7 — All required shadow tokens defined in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

test("criterion 7 — tokens.css defines --shadow-xs: 0 1px 3px rgba(0, 0, 0, 0.05)", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--shadow-xs\s*:\s*0 1px 3px rgba\(0,\s*0,\s*0,\s*0\.05\)/);
});

test("criterion 7 — tokens.css defines --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.08)", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--shadow-md\s*:\s*0 4px 24px rgba\(0,\s*0,\s*0,\s*0\.08\)/);
});

test("criterion 7 — tokens.css defines --shadow-sm: 0 4px 16px rgba(0, 0, 0, 0.08)", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--shadow-sm\s*:\s*0 4px 16px rgba\(0,\s*0,\s*0,\s*0\.08\)/);
});

test("criterion 7 — tokens.css defines --shadow-focus-ring: 0 0 0 3px rgba(20, 184, 166, 0.1)", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(
    /--shadow-focus-ring\s*:\s*0 0 0 3px rgba\(20,\s*184,\s*166,\s*0\.1\)/,
  );
});

test("criterion 7 — tokens.css defines --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.15)", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--shadow-lg\s*:\s*0 4px 12px rgba\(0,\s*0,\s*0,\s*0\.15\)/);
});

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 8 — All required gradient tokens defined in tokens.css
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_GRADIENTS: Array<{ token: string; pattern: RegExp }> = [
  {
    token: "--gradient-teal-diagonal",
    pattern: /--gradient-teal-diagonal\s*:.*linear-gradient\(135deg,\s*#14[Bb]8[Aa]6\s+0%,\s*#0[Dd]9488\s+100%\)/,
  },
  {
    token: "--gradient-teal-light",
    pattern: /--gradient-teal-light\s*:.*linear-gradient\(135deg,\s*#[Ff]0[Ff][Dd][Ff][Aa]\s+0%,\s*#[Cc]{2}[Ff][Bb][Ff]1\s+100%\)/,
  },
  {
    token: "--gradient-teal-horizontal",
    pattern: /--gradient-teal-horizontal\s*:.*linear-gradient\(90deg,\s*#14[Bb]8[Aa]6\s+0%,\s*#0[Dd]9488\s+100%\)/,
  },
  {
    token: "--gradient-coral",
    pattern: /--gradient-coral\s*:.*linear-gradient\(135deg,\s*#[Ff][Ff]6[Bb]6[Bb]\s+0%,\s*#[Ff][Ff]8[Ee]53\s+100%\)/,
  },
  {
    token: "--gradient-red-horizontal",
    pattern: /--gradient-red-horizontal\s*:.*linear-gradient\(to right,\s*#[Ff][Ee][Ee]2[Ee]2/,
  },
  {
    token: "--gradient-blue-horizontal",
    pattern: /--gradient-blue-horizontal\s*:.*linear-gradient\(to right,\s*#[Dd][Bb][Ee][Aa][Ff][Ee]/,
  },
  {
    token: "--gradient-amber-horizontal",
    pattern: /--gradient-amber-horizontal\s*:.*linear-gradient\(90deg,\s*#[Ff]59[Ee]0[Bb]\s+0%,\s*#[Dd]97706\s+100%\)/,
  },
  {
    token: "--gradient-red-solid",
    pattern: /--gradient-red-solid\s*:.*linear-gradient\(90deg,\s*#[Ee][Ff]4444\s+0%,\s*#[Dd][Cc]2626\s+100%\)/,
  },
];

for (const { token, pattern } of REQUIRED_GRADIENTS) {
  test(`criterion 8 — tokens.css defines ${token} with the correct gradient value`, () => {
    const css = readCss(TOKENS_CSS_PATH);
    expect(css).toMatch(pattern);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CRITERION 9 — Breakpoint tokens defined in tokens.css and used in CSS module
// ══════════════════════════════════════════════════════════════════════════════

test("criterion 9 — tokens.css defines --breakpoint-sm: 480px", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--breakpoint-sm\s*:\s*480px/);
});

test("criterion 9 — tokens.css defines --breakpoint-md: 768px", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--breakpoint-md\s*:\s*768px/);
});

test("criterion 9 — tokens.css defines --breakpoint-lg: 1024px", () => {
  const css = readCss(TOKENS_CSS_PATH);
  expect(css).toMatch(/--breakpoint-lg\s*:\s*1024px/);
});

test("criterion 9 — ConnectedDevicesPage.module.css uses a @media (max-width: 768px) breakpoint", () => {
  const css = readCss(MODULE_CSS_PATH);
  expect(css).toContain("@media (max-width: 768px)");
});

test("criterion 9 — ConnectedDevicesPage.module.css uses a @media (max-width: 480px) breakpoint", () => {
  const css = readCss(MODULE_CSS_PATH);
  expect(css).toContain("@media (max-width: 480px)");
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT RENDERING — CSS class names from the restyled module are applied
// ══════════════════════════════════════════════════════════════════════════════

const CONNECTED_SMARTWATCH = {
  id: "dev-001",
  deviceName: "Fitbit Charge 5",
  provider: "Fitbit",
  deviceType: "smartwatch" as const,
  status: "connected",
  lastSyncAt: "2026-01-17T08:30:00.000Z",
  lastSuccessfulSyncAt: "2026-01-17T08:30:00.000Z",
  batteryLevel: "78%",
  connectedSince: "2026-01-15T00:00:00.000Z",
  isStale: false,
  staleAfterHours: 18,
};

const STALE_SCALE = {
  id: "dev-002",
  deviceName: "Withings Body+",
  provider: "Withings",
  deviceType: "smart_scale" as const,
  status: "pending",
  lastSyncAt: "2026-01-16T14:00:00.000Z",
  lastSuccessfulSyncAt: null,
  batteryLevel: "Good",
  connectedSince: "2026-01-15T00:00:00.000Z",
  isStale: true,
  staleAfterHours: 18,
};

const ERROR_SMARTWATCH = {
  id: "dev-003",
  deviceName: "Apple Watch Series 8",
  provider: "Apple",
  deviceType: "smartwatch" as const,
  status: "error",
  lastSyncAt: "2026-01-14T10:00:00.000Z",
  lastSuccessfulSyncAt: null,
  batteryLevel: "Unknown",
  connectedSince: "2025-12-20T00:00:00.000Z",
  isStale: false,
  staleAfterHours: 18,
};

test("criterion 1 (rendering) — connected device badge carries the statusSynced token-class (green styling)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([CONNECTED_SMARTWATCH]));
  renderPage();
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const badge = within(card).getByText("✓ Synced");
  // statusSynced class drives the token-based green background/text
  expect(badge.className).toContain("statusSynced");
});

test("criterion 1 (rendering) — stale device badge carries the statusWarning token-class (yellow styling)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([STALE_SCALE]));
  renderPage();
  const heading = await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const badge = within(card).getByText("⚠ Stale Data");
  // statusWarning class drives the token-based amber background/text
  expect(badge.className).toContain("statusWarning");
});

test("criterion 1 (rendering) — sync-failed device badge carries the statusError token-class (red styling)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([ERROR_SMARTWATCH]));
  renderPage();
  const heading = await screen.findByRole("heading", { name: "Apple Watch Series 8", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const badge = within(card).getByText("✗ Sync Failed");
  // statusError class drives the token-based red background/text
  expect(badge.className).toContain("statusError");
});

test("criterion 1 (rendering) — device icon area has a class referencing the gradient-teal-light token", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([CONNECTED_SMARTWATCH]));
  renderPage();
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  // The deviceIcon element must receive the CSS class that applies --gradient-teal-light
  const icon = card.querySelector("[aria-hidden='true']");
  if (!icon) throw new Error("Expected aria-hidden device icon element");
  expect(icon.className).toContain("deviceIcon");
  // Verify the CSS module maps deviceIcon to --gradient-teal-light
  const moduleCss = readCss(MODULE_CSS_PATH);
  const deviceIconBlock = moduleCss.match(/\.deviceIcon\s*\{[^}]+\}/);
  if (!deviceIconBlock) throw new Error("Expected .deviceIcon rule in CSS module");
  expect(deviceIconBlock[0]).toContain("--gradient-teal-light");
});

test("criterion 1 (rendering) — Add Another Device section is present and headlined by an h2", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("heading", { name: "Add Another Device", level: 2 });
});

test("criterion 1 (rendering) — page heading uses the pageHeading token-class styled with --font-size-28", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  const heading = await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  expect(heading.className).toContain("pageHeading");
  // The pageHeading rule must reference --font-size-28
  const moduleCss = readCss(MODULE_CSS_PATH);
  const pageHeadingBlock = moduleCss.match(/\.pageHeading\s*\{[^}]+\}/);
  if (!pageHeadingBlock) throw new Error("Expected .pageHeading rule in CSS module");
  expect(pageHeadingBlock[0]).toContain("--font-size-28");
});

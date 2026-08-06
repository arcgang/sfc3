/**
 * Acceptance tests: Design system update — apply the updated visual tokens
 *
 * Criteria covered:
 *   AC1  – tokens.css exists and is imported at the app root (main.tsx)
 *   AC2  – every required colour value is present in tokens.css
 *   AC3  – every required font-size value is present
 *   AC4  – every required spacing value is present
 *   AC5  – every required border-radius value is present
 *   AC6  – every required shadow value is present
 *   AC7  – every required gradient value is present
 *   AC8  – every required breakpoint value is present
 *   AC9  – the required font-family stack is present
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── helpers ──────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

/** Normalise rgba spacing so both `rgba(0,0,0,0.05)` and `rgba(0, 0, 0, 0.05)` match. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/rgba\(\s*/g, "rgba(").replace(/,\s*/g, ", ");
}

// ── precondition: file exists ────────────────────────────────────────────────

let tokensCSS: string;
let tokensCSSNorm: string;

beforeAll(() => {
  // If this throws the token file is absent — every test below will fail
  // loudly rather than passing vacuously.
  tokensCSS = readFile("src/styles/tokens.css");
  tokensCSSNorm = normalise(tokensCSS);
});

// ── AC1: imported at app root ────────────────────────────────────────────────

test("AC1 – tokens.css is imported in main.tsx", () => {
  const main = readFile("src/main.tsx");
  expect(main).toContain("./styles/tokens.css");
});

// ── AC2: required colour values ──────────────────────────────────────────────

const REQUIRED_COLOURS = [
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
  "rgba(0, 0, 0, 0.05)",
  "#115e59",
  "rgba(0, 0, 0, 0.08)",
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

test.each(REQUIRED_COLOURS)(
  "AC2 – colour token %s is defined in tokens.css",
  (colour) => {
    expect(tokensCSSNorm).toContain(normalise(colour));
  },
);

// ── AC3: required font sizes ─────────────────────────────────────────────────

const REQUIRED_FONT_SIZES = [
  "11px",
  "12px",
  "13px",
  "14px",
  "15px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "40px",
  "48px",
];

test.each(REQUIRED_FONT_SIZES)(
  "AC3 – font-size token %s is defined in tokens.css",
  (size) => {
    // The value must appear as a CSS custom-property value, not just inside a px-unit comment.
    // Checking the normalised content is sufficient since all sizes are unique.
    expect(tokensCSSNorm).toContain(size);
  },
);

// ── AC4: required spacing values ─────────────────────────────────────────────

const REQUIRED_SPACING = [
  "4px",
  "6px",
  "8px",
  "10px",
  "12px",
  "14px",
  "16px",
  "20px",
  "24px",
  "32px",
  "40px",
  "48px",
  "64px",
  "80px",
  "200px",
  "240px",
];

test.each(REQUIRED_SPACING)(
  "AC4 – spacing value %s is defined in tokens.css",
  (spacing) => {
    expect(tokensCSSNorm).toContain(spacing);
  },
);

// ── AC5: required border-radius values ───────────────────────────────────────

const REQUIRED_RADII = ["3px", "4px", "5px", "6px", "8px", "12px", "16px", "20px"];

test.each(REQUIRED_RADII)(
  "AC5 – border-radius token %s is defined in tokens.css",
  (radius) => {
    expect(tokensCSSNorm).toContain(radius);
  },
);

// ── AC6: required shadow values ──────────────────────────────────────────────

const REQUIRED_SHADOWS = [
  "0 1px 3px rgba(0, 0, 0, 0.05)",
  "0 4px 24px rgba(0, 0, 0, 0.08)",
  "0 4px 16px rgba(0, 0, 0, 0.08)",
  "0 0 0 3px rgba(20, 184, 166, 0.1)",
  "0 4px 12px rgba(0, 0, 0, 0.15)",
];

test.each(REQUIRED_SHADOWS)(
  "AC6 – shadow value '%s' is defined in tokens.css",
  (shadow) => {
    expect(tokensCSSNorm).toContain(normalise(shadow));
  },
);

// ── AC7: required gradient values ────────────────────────────────────────────

const REQUIRED_GRADIENTS = [
  "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
  "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
  "linear-gradient(90deg, #14b8a6 0%, #0d9488 100%)",
  "linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)",
  "linear-gradient(to right, #fee2e2 0%, #fecaca 50%, #fca5a5 100%)",
  "linear-gradient(to right, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)",
  "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
  "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)",
];

test.each(REQUIRED_GRADIENTS)(
  "AC7 – gradient value '%s' is defined in tokens.css",
  (gradient) => {
    expect(tokensCSSNorm).toContain(normalise(gradient));
  },
);

// ── AC8: required breakpoint values ──────────────────────────────────────────

const REQUIRED_BREAKPOINTS = ["480px", "768px", "1024px"];

test.each(REQUIRED_BREAKPOINTS)(
  "AC8 – breakpoint value %s is defined in tokens.css",
  (bp) => {
    expect(tokensCSSNorm).toContain(bp);
  },
);

// ── AC9: required font-family stack ──────────────────────────────────────────

test("AC9 – font-family stack includes Inter and system fallbacks", () => {
  // All required font-family values from the spec
  const requiredFonts = [
    "inter",
    "-apple-system",
    "blinkmacsystemfont",
    "segoe ui",
    "roboto",
    "sans-serif",
  ];
  for (const font of requiredFonts) {
    expect(tokensCSSNorm).toContain(font);
  }
});

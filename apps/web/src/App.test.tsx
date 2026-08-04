import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

function renderWithRouter(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

// ── BrowserRouter shell ──────────────────────────────────────────────────────

test("/ renders the homepage (not the placeholder shell)", () => {
  renderWithRouter("/");
  expect(
    screen.getByRole("heading", {
      name: /One place for your complete wellness picture/i,
      level: 1,
    }),
  ).toBeTruthy();
});

test("/privacy renders the PrivacyPolicy stub", () => {
  renderWithRouter("/privacy");
  expect(
    screen.getByRole("heading", { name: "Privacy Policy", level: 1 }),
  ).toBeTruthy();
});

test("unknown route renders the placeholder catch-all", () => {
  renderWithRouter("/nonexistent-route");
  expect(screen.getByRole("heading", { name: "Web" })).toBeTruthy();
});

// ── Homepage structure ───────────────────────────────────────────────────────

test("homepage renders Log In link in header", () => {
  renderWithRouter("/");
  expect(screen.getByRole("link", { name: "Log In" })).toBeTruthy();
});

test("homepage renders Get Started Free CTA link", () => {
  renderWithRouter("/");
  expect(screen.getByRole("link", { name: "Get Started Free" })).toBeTruthy();
});

test("homepage renders primary headline", () => {
  renderWithRouter("/");
  expect(
    screen.getByRole("heading", {
      name: /One place for your complete wellness picture/i,
      level: 1,
    }),
  ).toBeTruthy();
});

test("homepage renders hero tagline text", () => {
  renderWithRouter("/");
  expect(
    screen.getByText(/One place for your complete wellness picture/),
  ).toBeTruthy();
});

// ── Four health domain cards ─────────────────────────────────────────────────

test("homepage renders Activity health domain card", () => {
  renderWithRouter("/");
  expect(screen.getByRole("heading", { name: "Activity" })).toBeTruthy();
});

test("homepage renders Sleep health domain card", () => {
  renderWithRouter("/");
  expect(screen.getByRole("heading", { name: "Sleep" })).toBeTruthy();
});

test("homepage renders Vital Metrics health domain card", () => {
  renderWithRouter("/");
  expect(screen.getByRole("heading", { name: "Vital Metrics" })).toBeTruthy();
});

test("homepage renders Body Composition health domain card", () => {
  renderWithRouter("/");
  expect(
    screen.getByRole("heading", { name: "Body Composition" }),
  ).toBeTruthy();
});

// ── Statistics strip ─────────────────────────────────────────────────────────

test("homepage statistics strip shows '4' core health domains metric", () => {
  renderWithRouter("/");
  expect(screen.getByText("4")).toBeTruthy();
  expect(screen.getByText("Core health domains monitored")).toBeTruthy();
});

test("homepage statistics strip shows '1' unified dashboard metric", () => {
  renderWithRouter("/");
  expect(screen.getByText("1")).toBeTruthy();
  expect(
    screen.getByText("Unified dashboard replacing multiple apps"),
  ).toBeTruthy();
});

test("homepage statistics strip shows 'Daily' synchronization metric", () => {
  renderWithRouter("/");
  expect(screen.getByText("Daily")).toBeTruthy();
  expect(
    screen.getByText("Near-daily synchronization visibility"),
  ).toBeTruthy();
});

test("homepage statistics strip shows '100%' privacy metric", () => {
  renderWithRouter("/");
  expect(screen.getByText("100%")).toBeTruthy();
  expect(screen.getByText("Privacy-first handling of your data")).toBeTruthy();
});

// ── Trust section ────────────────────────────────────────────────────────────

test("homepage trust section renders 'You Own Your Data' card", () => {
  renderWithRouter("/");
  expect(
    screen.getByRole("heading", { name: "You Own Your Data" }),
  ).toBeTruthy();
});

test("homepage trust section renders 'Encrypted & Secure' card", () => {
  renderWithRouter("/");
  expect(
    screen.getByRole("heading", { name: "Encrypted & Secure" }),
  ).toBeTruthy();
});

test("homepage trust section renders 'Never Sold' card", () => {
  renderWithRouter("/");
  expect(screen.getByRole("heading", { name: "Never Sold" })).toBeTruthy();
});

test("homepage trust section states data is never sold to third parties", () => {
  renderWithRouter("/");
  expect(
    screen.getByText(/never sell your.*health.*data.*third parties/i),
  ).toBeTruthy();
});

test("homepage trust section states data is encrypted at rest and in transit", () => {
  renderWithRouter("/");
  expect(screen.getByText(/encrypted at rest and in transit/i)).toBeTruthy();
});

// ── Footer ───────────────────────────────────────────────────────────────────

test("homepage footer contains Privacy Policy link", () => {
  renderWithRouter("/");
  expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeTruthy();
});

test("homepage footer contains Terms of Service link", () => {
  renderWithRouter("/");
  expect(
    screen.getByRole("link", { name: "Terms of Service" }),
  ).toBeTruthy();
});

test("Privacy Policy footer link points to /privacy route", () => {
  renderWithRouter("/");
  const link = screen.getByRole("link", { name: "Privacy Policy" });
  expect(link.getAttribute("href")).toBe("/privacy");
});

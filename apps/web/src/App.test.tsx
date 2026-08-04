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
  screen.getByRole("heading", {
    name: /One place for your complete wellness picture/i,
    level: 1,
  });
});

test("/privacy renders the PrivacyPolicy stub", () => {
  renderWithRouter("/privacy");
  screen.getByRole("heading", { name: "Privacy Policy", level: 1 });
});

test("unknown route renders the placeholder catch-all", () => {
  renderWithRouter("/nonexistent-route");
  screen.getByRole("heading", { name: "Web" });
});

// ── Homepage structure ───────────────────────────────────────────────────────

test("homepage renders Log In link in header", () => {
  renderWithRouter("/");
  screen.getByRole("link", { name: "Log In" });
});

test("homepage Log In link points to /login", () => {
  renderWithRouter("/");
  const link = screen.getByRole("link", { name: "Log In" });
  expect(link.getAttribute("href")).toBe("/login");
});

test("homepage renders Get Started Free CTA link", () => {
  renderWithRouter("/");
  screen.getByRole("link", { name: "Get Started Free" });
});

test("homepage Get Started Free CTA link points to /register", () => {
  renderWithRouter("/");
  const link = screen.getByRole("link", { name: "Get Started Free" });
  expect(link.getAttribute("href")).toBe("/register");
});

test("homepage supporting copy matches spec", () => {
  renderWithRouter("/");
  screen.getByText(
    /Connect your smartwatch and smart scale, see your health trends in one dashboard, and get simple guidance you can act on every day\./i,
  );
});

test("homepage renders primary headline", () => {
  renderWithRouter("/");
  screen.getByRole("heading", {
    name: /One place for your complete wellness picture/i,
    level: 1,
  });
});

test("homepage renders primary headline text", () => {
  renderWithRouter("/");
  screen.getByText(/One place for your complete wellness picture/);
});

// ── Four health domain cards ─────────────────────────────────────────────────

test("homepage renders Activity health domain card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "Activity" });
});

test("homepage renders Sleep health domain card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "Sleep" });
});

test("homepage renders Vital Metrics health domain card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "Vital Metrics" });
});

test("homepage renders Body Composition health domain card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "Body Composition" });
});

// ── Statistics strip ─────────────────────────────────────────────────────────

test("homepage statistics strip shows '4' core health domains metric", () => {
  renderWithRouter("/");
  screen.getByText("4");
  screen.getByText("Core health domains monitored");
});

test("homepage statistics strip shows '1' unified dashboard metric", () => {
  renderWithRouter("/");
  screen.getByText("1");
  screen.getByText("Unified dashboard replacing multiple apps");
});

test("homepage statistics strip shows 'Daily' synchronization metric", () => {
  renderWithRouter("/");
  screen.getByText("Daily");
  screen.getByText("Near-daily synchronization visibility");
});

test("homepage statistics strip shows '100%' privacy metric", () => {
  renderWithRouter("/");
  screen.getByText("100%");
  screen.getByText("Privacy-first handling of your data");
});

// ── Trust section ────────────────────────────────────────────────────────────

test("homepage trust section renders 'You Own Your Data' card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "You Own Your Data" });
});

test("homepage trust section renders 'Encrypted & Secure' card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "Encrypted & Secure" });
});

test("homepage trust section renders 'Never Sold' card", () => {
  renderWithRouter("/");
  screen.getByRole("heading", { name: "Never Sold" });
});

test("homepage trust section states data is never sold to third parties", () => {
  renderWithRouter("/");
  screen.getByText(/never sell your.*health.*data.*third parties/i);
});

test("homepage trust section states data is encrypted at rest and in transit", () => {
  renderWithRouter("/");
  screen.getByText(/encrypted at rest and in transit/i);
});

// ── Footer ───────────────────────────────────────────────────────────────────

test("homepage footer contains Privacy Policy link", () => {
  renderWithRouter("/");
  screen.getByRole("link", { name: "Privacy Policy" });
});

test("homepage footer contains Terms of Service link", () => {
  renderWithRouter("/");
  screen.getByRole("link", { name: "Terms of Service" });
});

test("Privacy Policy footer link points to /privacy route", () => {
  renderWithRouter("/");
  const link = screen.getByRole("link", { name: "Privacy Policy" });
  expect(link.getAttribute("href")).toBe("/privacy");
});

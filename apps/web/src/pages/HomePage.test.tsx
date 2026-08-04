import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

// ── Health domain cards ───────────────────────────────────────────────────────

test("health domains section has heading 'Everything you need to track your wellness'", () => {
  renderHomePage();
  screen.getByRole("heading", {
    name: "Everything you need to track your wellness",
    level: 2,
  });
});

test("Activity health domain card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Activity", level: 3 });
});

test("Sleep health domain card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Sleep", level: 3 });
});

test("Vital Metrics health domain card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Vital Metrics", level: 3 });
});

test("Body Composition health domain card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Body Composition", level: 3 });
});

test("Activity card shows correct description", () => {
  renderHomePage();
  screen.getByText(
    /Track your daily steps, active minutes, calories burned, and workout patterns/,
  );
});

test("Sleep card shows correct description", () => {
  renderHomePage();
  screen.getByText(
    /Monitor sleep duration, quality, and consistency/,
  );
});

test("Vital Metrics card shows correct description", () => {
  renderHomePage();
  screen.getByText(
    /Keep an eye on heart rate, resting heart rate, blood pressure/,
  );
});

test("Body Composition card shows correct description", () => {
  renderHomePage();
  screen.getByText(
    /Track weight, body fat percentage, muscle mass/,
  );
});

// ── Statistics strip ──────────────────────────────────────────────────────────

test("statistics strip shows value '4'", () => {
  renderHomePage();
  screen.getByText("4");
});

test("statistics strip shows label 'Core health domains monitored'", () => {
  renderHomePage();
  screen.getByText("Core health domains monitored");
});

test("statistics strip shows value '1'", () => {
  renderHomePage();
  screen.getByText("1");
});

test("statistics strip shows label 'Unified dashboard replacing multiple apps'", () => {
  renderHomePage();
  screen.getByText("Unified dashboard replacing multiple apps");
});

test("statistics strip shows value 'Daily'", () => {
  renderHomePage();
  screen.getByText("Daily");
});

test("statistics strip shows label 'Near-daily synchronization visibility'", () => {
  renderHomePage();
  screen.getByText("Near-daily synchronization visibility");
});

test("statistics strip shows value '100%'", () => {
  renderHomePage();
  screen.getByText("100%");
});

test("statistics strip shows label 'Privacy-first handling of your data'", () => {
  renderHomePage();
  screen.getByText("Privacy-first handling of your data");
});

// ── Trust section ─────────────────────────────────────────────────────────────

test("trust section has heading 'Your data, your control'", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Your data, your control", level: 2 });
});

test("trust section 'You Own Your Data' card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "You Own Your Data", level: 3 });
});

test("trust section 'Encrypted & Secure' card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Encrypted & Secure", level: 3 });
});

test("trust section 'Never Sold' card heading is present", () => {
  renderHomePage();
  screen.getByRole("heading", { name: "Never Sold", level: 3 });
});

test("trust 'You Own Your Data' card shows correct copy", () => {
  renderHomePage();
  screen.getByText(
    "Your health information belongs to you. Export or delete it anytime.",
  );
});

test("trust 'Encrypted & Secure' card shows copy stating encrypted at rest and in transit", () => {
  renderHomePage();
  screen.getByText(/encrypted at rest and in transit/i);
});

test("trust 'Never Sold' card shows copy stating data is never sold to third parties", () => {
  renderHomePage();
  screen.getByText(
    /never sell your personal health data to advertisers or third parties/i,
  );
});

test("trust section intro copy states data is never sold to third parties", () => {
  renderHomePage();
  screen.getByText(/never sell your.*health.*data.*third parties/i);
});

// ── Footer ────────────────────────────────────────────────────────────────────

test("footer contains a 'Privacy Policy' link", () => {
  renderHomePage();
  screen.getByRole("link", { name: "Privacy Policy" });
});

test("footer 'Privacy Policy' link points to /privacy", () => {
  renderHomePage();
  const link = screen.getByRole("link", { name: "Privacy Policy" });
  expect(link.getAttribute("href")).toBe("/privacy");
});

test("footer contains a 'Terms of Service' link", () => {
  renderHomePage();
  screen.getByRole("link", { name: "Terms of Service" });
});

test("footer 'Terms of Service' link points to /terms", () => {
  renderHomePage();
  const link = screen.getByRole("link", { name: "Terms of Service" });
  expect(link.getAttribute("href")).toBe("/terms");
});

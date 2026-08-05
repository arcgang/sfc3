import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { App } from "../App.js";
import { DashboardPage } from "./DashboardPage.js";
import { Layout } from "../components/Layout.js";

function renderDashboardPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderViaApp(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Route registration ────────────────────────────────────────────────────────

test("/dashboard route renders the Dashboard page", () => {
  renderViaApp("/dashboard");
  screen.getByRole("heading", { name: /Good morning, Michael!/i, level: 1 });
});

// ── Sidebar navigation on dashboard ──────────────────────────────────────────

test("dashboard page sidebar contains Dashboard link", () => {
  renderDashboardPage();
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("dashboard page sidebar contains My Account link", () => {
  renderDashboardPage();
  screen.getByRole("link", { name: "👤 My Account" });
});

test("dashboard page sidebar contains Partners & Services link", () => {
  renderDashboardPage();
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("dashboard page sidebar shows user name", () => {
  renderDashboardPage();
  screen.getByText("Alex Johnson");
});

test("dashboard page sidebar shows user email", () => {
  renderDashboardPage();
  screen.getByText("alex@example.com");
});

test("dashboard page sidebar Log out link is present", () => {
  renderDashboardPage();
  screen.getByRole("link", { name: "Log out" });
});

// ── Goals section ─────────────────────────────────────────────────────────────

test("dashboard Goals section heading is rendered", () => {
  renderDashboardPage();
  screen.getByRole("heading", { name: "Goals", level: 2 });
});

test("dashboard Goals section shows 'On track' count", () => {
  renderDashboardPage();
  screen.getByText("On track");
});

test("dashboard Goals section shows 'At risk' count", () => {
  renderDashboardPage();
  screen.getByText("At risk");
});

test("dashboard Goals section shows 'Missed' count", () => {
  renderDashboardPage();
  screen.getByText("Missed");
});

test("dashboard Goals section has 'View All Goals →' link", () => {
  renderDashboardPage();
  screen.getByRole("link", { name: "View All Goals →" });
});

test("'View All Goals →' link points to /goals", () => {
  renderDashboardPage();
  const link = screen.getByRole("link", { name: "View All Goals →" });
  expect(link.getAttribute("href")).toBe("/goals");
});

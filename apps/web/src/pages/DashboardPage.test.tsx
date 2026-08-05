import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, type MockedFunction } from "vitest";
import { App } from "../App.js";
import { DashboardPage } from "./DashboardPage.js";
import { Layout } from "../components/Layout.js";
import * as apiModule from "../api.js";

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockApiFetch = apiModule.apiFetch as MockedFunction<typeof apiModule.apiFetch>;

function makeGoalsResponse(goals: Array<{ id: string; status: string }>) {
  return {
    data: {
      goals: goals.map((g) => ({
        id: g.id,
        goalType: "steps_daily",
        targetValue: 10000,
        targetUnit: "steps",
        cadence: "daily",
        startDate: "2026-01-01",
        status: g.status,
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    },
  };
}

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

beforeEach(() => {
  mockApiFetch.mockResolvedValue(makeGoalsResponse([]));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Route registration ────────────────────────────────────────────────────────

test("/dashboard route renders the Dashboard page", async () => {
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

test("dashboard Goals section shows 'On track' label", () => {
  renderDashboardPage();
  screen.getByText("On track");
});

test("dashboard Goals section shows 'At risk' label", () => {
  renderDashboardPage();
  screen.getByText("At risk");
});

test("dashboard Goals section shows 'Missed' label", () => {
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

// ── Goals counts from API ─────────────────────────────────────────────────────

test("displays correct on-track count from API response", async () => {
  mockApiFetch.mockResolvedValue(
    makeGoalsResponse([
      { id: "1", status: "active" },
      { id: "2", status: "active" },
      { id: "3", status: "at_risk" },
    ]),
  );
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const onTrackItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("On track") !== null);
  expect(within(onTrackItem!).getByText("2")).toBeTruthy();
});

test("displays correct at-risk count from API response", async () => {
  mockApiFetch.mockResolvedValue(
    makeGoalsResponse([
      { id: "1", status: "active" },
      { id: "2", status: "at_risk" },
      { id: "3", status: "at_risk" },
    ]),
  );
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const atRiskItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("At risk") !== null);
  expect(within(atRiskItem!).getByText("2")).toBeTruthy();
});

test("displays correct missed count from API response", async () => {
  mockApiFetch.mockResolvedValue(
    makeGoalsResponse([
      { id: "1", status: "active" },
      { id: "2", status: "missed" },
      { id: "3", status: "missed" },
      { id: "4", status: "missed" },
    ]),
  );
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const missedItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("Missed") !== null);
  expect(within(missedItem!).getByText("3")).toBeTruthy();
});

test("displays zero counts when API returns empty goals list", async () => {
  mockApiFetch.mockResolvedValue(makeGoalsResponse([]));
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const items = within(list).getAllByRole("listitem");
  for (const item of items) {
    expect(within(item).getByText("0")).toBeTruthy();
  }
});

test("shows error message and retry button when API call fails", async () => {
  mockApiFetch.mockRejectedValue(new Error("Network error"));
  renderDashboardPage();
  await screen.findByText("Failed to load goals.");
  screen.getByRole("button", { name: "Retry" });
});

test("calls GET /goals on mount", async () => {
  renderDashboardPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/goals",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, type MockedFunction } from "vitest";
import { App } from "../App.js";
import { DashboardPage } from "./DashboardPage.js";
import { Layout } from "../components/Layout.js";
import { AuthProvider } from "../context/AuthContext.js";
import * as apiModule from "../api.js";

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockApiFetch = apiModule.apiFetch as MockedFunction<typeof apiModule.apiFetch>;

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeDashboardResponse(overrides: {
  greeting?: string;
  personaMode?: string;
  cards?: Array<{
    id: string;
    label: string;
    value: number | string | null;
    unit: string;
    badge: string;
    emptyState: boolean;
  }>;
} = {}) {
  const defaultCards = [
    { id: "HeartRate", label: "Resting Heart Rate", value: 103, unit: "bpm", badge: "⚠️ Monitor", emptyState: false },
    { id: "Steps", label: "Steps", value: 2097, unit: "steps", badge: "↑ 21% of goal", emptyState: false },
    { id: "BloodPressure", label: "Blood Pressure", value: "109/85", unit: "mmHg", badge: "⚠️ Elevated", emptyState: false },
    { id: "Sleep", label: "Sleep", value: 570, unit: "minutes", badge: "→ Fair", emptyState: false },
  ];
  return {
    data: {
      greeting: overrides.greeting ?? "Good morning, Michael!",
      personaMode: overrides.personaMode ?? "default",
      summaryCards: overrides.cards ?? defaultCards,
      lastSyncStatus: {
        overallLastSyncAt: "2026-08-06T10:00:00.000Z",
        isStale: false,
        staleThresholdHours: 18,
        stalenessLabel: "Up to date",
        deviceStatuses: [],
      },
    },
  };
}

function makeGoalsResponse(goals: Array<{ id: string; status: string }> = []) {
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
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function renderViaApp(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Route registration ────────────────────────────────────────────────────────

test("/dashboard route renders the Dashboard page", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
});

// ── Greeting header ───────────────────────────────────────────────────────────

test("greeting is rendered as h1 from API response", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
});

test("greeting reflects the name returned by the API", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ greeting: "Good evening, Sarah!" }));
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good evening, Sarah!", level: 1 });
});

// ── Summary cards ─────────────────────────────────────────────────────────────

test("all four card labels render", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = screen.getByRole("list", { name: "Health metrics" });
  expect(within(list).getByText("Resting Heart Rate ❤️")).toBeTruthy();
  expect(within(list).getByText("Steps 🚶")).toBeTruthy();
  expect(within(list).getByText("Blood Pressure 🩺")).toBeTruthy();
  expect(within(list).getByText("Sleep 😴")).toBeTruthy();
});

test("Heart Rate card displays value and status badge", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const hrCard = cards.find((c) => c.getAttribute("data-card-id") === "HeartRate")!;
  expect(within(hrCard).getByText("103")).toBeTruthy();
  expect(within(hrCard).getByText("⚠️ Monitor")).toBeTruthy();
});

test("Steps card displays value and percentage badge", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const stepsCard = cards.find((c) => c.getAttribute("data-card-id") === "Steps")!;
  expect(within(stepsCard).getByText("2,097")).toBeTruthy();
  expect(within(stepsCard).getByText("↑ 21% of goal")).toBeTruthy();
});

test("Blood Pressure card displays value and badge", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const bpCard = cards.find((c) => c.getAttribute("data-card-id") === "BloodPressure")!;
  expect(within(bpCard).getByText("109/85")).toBeTruthy();
  expect(within(bpCard).getByText("⚠️ Elevated")).toBeTruthy();
});

test("Sleep card displays duration and quality badge", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const sleepCard = cards.find((c) => c.getAttribute("data-card-id") === "Sleep")!;
  expect(within(sleepCard).getByText("9.5h")).toBeTruthy();
  expect(within(sleepCard).getByText("→ Fair")).toBeTruthy();
});

// ── Empty state ───────────────────────────────────────────────────────────────

test("a card with emptyState:true shows placeholder text and no value", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          cards: [
            { id: "HeartRate", label: "Resting Heart Rate", value: null, unit: "bpm", badge: "", emptyState: true },
            { id: "Steps", label: "Steps", value: null, unit: "steps", badge: "", emptyState: true },
            { id: "BloodPressure", label: "Blood Pressure", value: "109/85", unit: "mmHg", badge: "⚠️ Elevated", emptyState: false },
            { id: "Sleep", label: "Sleep", value: null, unit: "minutes", badge: "", emptyState: true },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const hrCard = cards.find((c) => c.getAttribute("data-card-id") === "HeartRate")!;

  expect(
    within(hrCard).getByText("No device connected — set up a device to see this metric"),
  ).toBeTruthy();
  expect(within(hrCard).queryByRole("strong")).toBeNull();
});

test("smartwatch-only: Steps and Sleep are populated; BloodPressure shows empty state", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          cards: [
            { id: "HeartRate", label: "Resting Heart Rate", value: 72, unit: "bpm", badge: "✓ Normal", emptyState: false },
            { id: "Steps", label: "Steps", value: 8000, unit: "steps", badge: "↑ 80% of goal", emptyState: false },
            { id: "BloodPressure", label: "Blood Pressure", value: null, unit: "mmHg", badge: "", emptyState: true },
            { id: "Sleep", label: "Sleep", value: 480, unit: "minutes", badge: "Good", emptyState: false },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const bpCard = cards.find((c) => c.getAttribute("data-card-id") === "BloodPressure")!;
  expect(
    within(bpCard).getByText("No device connected — set up a device to see this metric"),
  ).toBeTruthy();
});

test("smart-scale-only: HeartRate, Steps, Sleep show empty states", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          cards: [
            { id: "HeartRate", label: "Resting Heart Rate", value: null, unit: "bpm", badge: "", emptyState: true },
            { id: "Steps", label: "Steps", value: null, unit: "steps", badge: "", emptyState: true },
            { id: "BloodPressure", label: "Blood Pressure", value: "120/80", unit: "mmHg", badge: "✓ Normal", emptyState: false },
            { id: "Sleep", label: "Sleep", value: null, unit: "minutes", badge: "", emptyState: true },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");

  for (const id of ["HeartRate", "Steps", "Sleep"] as const) {
    const card = cards.find((c) => c.getAttribute("data-card-id") === id)!;
    expect(within(card).getByText("No device connected — set up a device to see this metric")).toBeTruthy();
  }
  const bpCard = cards.find((c) => c.getAttribute("data-card-id") === "BloodPressure")!;
  expect(within(bpCard).queryByText("No device connected — set up a device to see this metric")).toBeNull();
});

// ── Persona card ordering ─────────────────────────────────────────────────────

test("default persona orders cards: HeartRate, Steps, BloodPressure, Sleep", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          personaMode: "default",
          cards: [
            { id: "HeartRate", label: "Resting Heart Rate", value: 72, unit: "bpm", badge: "✓ Normal", emptyState: false },
            { id: "Steps", label: "Steps", value: 8000, unit: "steps", badge: "↑ 80% of goal", emptyState: false },
            { id: "BloodPressure", label: "Blood Pressure", value: "120/80", unit: "mmHg", badge: "✓ Normal", emptyState: false },
            { id: "Sleep", label: "Sleep", value: 480, unit: "minutes", badge: "Good", emptyState: false },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cardIds = within(list).getAllByRole("listitem").map((c) => c.getAttribute("data-card-id"));
  expect(cardIds).toEqual(["HeartRate", "Steps", "BloodPressure", "Sleep"]);
});

test("fitness persona orders cards: Steps, HeartRate, Sleep, BloodPressure", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          personaMode: "fitness",
          cards: [
            { id: "Steps", label: "Steps", value: 8000, unit: "steps", badge: "↑ 80% of goal", emptyState: false },
            { id: "HeartRate", label: "Resting Heart Rate", value: 72, unit: "bpm", badge: "✓ Normal", emptyState: false },
            { id: "Sleep", label: "Sleep", value: 480, unit: "minutes", badge: "Good", emptyState: false },
            { id: "BloodPressure", label: "Blood Pressure", value: "120/80", unit: "mmHg", badge: "✓ Normal", emptyState: false },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cardIds = within(list).getAllByRole("listitem").map((c) => c.getAttribute("data-card-id"));
  expect(cardIds).toEqual(["Steps", "HeartRate", "Sleep", "BloodPressure"]);
});

test("chronic_care_aware persona orders cards: HeartRate, BloodPressure, Sleep, Steps", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          personaMode: "chronic_care_aware",
          cards: [
            { id: "HeartRate", label: "Resting Heart Rate", value: 72, unit: "bpm", badge: "✓ Normal", emptyState: false },
            { id: "BloodPressure", label: "Blood Pressure", value: "120/80", unit: "mmHg", badge: "✓ Normal", emptyState: false },
            { id: "Sleep", label: "Sleep", value: 480, unit: "minutes", badge: "Good", emptyState: false },
            { id: "Steps", label: "Steps", value: 8000, unit: "steps", badge: "↑ 80% of goal", emptyState: false },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cardIds = within(list).getAllByRole("listitem").map((c) => c.getAttribute("data-card-id"));
  expect(cardIds).toEqual(["HeartRate", "BloodPressure", "Sleep", "Steps"]);
});

// ── Loading and error states ──────────────────────────────────────────────────

test("shows loading state while dashboard is fetching", () => {
  mockApiFetch.mockImplementation(() => new Promise(() => {})); // never resolves
  renderDashboardPage();
  screen.getByRole("heading", { name: "Loading…", level: 1 });
});

test("shows error message with Retry when dashboard fetch fails", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.reject(new Error("Network error"));
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByText("Failed to load dashboard data.");
  screen.getByRole("button", { name: "Retry" });
});

test("Refresh button re-fetches dashboard", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const refreshButton = screen.getByRole("button", { name: "Refresh dashboard" });
  fireEvent.click(refreshButton);

  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith("/dashboard", expect.objectContaining({}));
  });
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
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    return Promise.resolve(
      makeGoalsResponse([
        { id: "1", status: "active" },
        { id: "2", status: "active" },
        { id: "3", status: "at_risk" },
      ]),
    );
  });
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const onTrackItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("On track") !== null);
  expect(within(onTrackItem!).getByText("2")).toBeTruthy();
});

test("displays correct at-risk count from API response", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    return Promise.resolve(
      makeGoalsResponse([
        { id: "1", status: "active" },
        { id: "2", status: "at_risk" },
        { id: "3", status: "at_risk" },
      ]),
    );
  });
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const atRiskItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("At risk") !== null);
  expect(within(atRiskItem!).getByText("2")).toBeTruthy();
});

test("displays correct missed count from API response", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    return Promise.resolve(
      makeGoalsResponse([
        { id: "1", status: "active" },
        { id: "2", status: "missed" },
        { id: "3", status: "missed" },
        { id: "4", status: "missed" },
      ]),
    );
  });
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const missedItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("Missed") !== null);
  expect(within(missedItem!).getByText("3")).toBeTruthy();
});

test("displays zero counts when API returns empty goals list", async () => {
  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const items = within(list).getAllByRole("listitem");
  for (const item of items) {
    expect(within(item).getByText("0")).toBeTruthy();
  }
});

test("shows error message and retry button when goals API call fails", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    return Promise.reject(new Error("Network error"));
  });
  renderDashboardPage();
  await screen.findByText("Failed to load goals.");
  screen.getByRole("button", { name: "Retry" });
});

test("calls GET /dashboard on mount", async () => {
  renderDashboardPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/dashboard",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
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

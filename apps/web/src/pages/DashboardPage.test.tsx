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

const SEVEN_DAYS_STEPS = [
  { date: "2026-07-31", stepCount: 7210 },
  { date: "2026-08-01", stepCount: 8040 },
  { date: "2026-08-02", stepCount: 6400 },
  { date: "2026-08-03", stepCount: 9100 },
  { date: "2026-08-04", stepCount: 10220 },
  { date: "2026-08-05", stepCount: 9870 },
  { date: "2026-08-06", stepCount: 7842 },
];

const INTRADAY_HR = [
  { recordedAt: "2026-08-06T08:00:00.000Z", bpm: 68 },
  { recordedAt: "2026-08-06T10:00:00.000Z", bpm: 85 },
  { recordedAt: "2026-08-06T12:00:00.000Z", bpm: 103 },
  { recordedAt: "2026-08-06T14:00:00.000Z", bpm: 92 },
  { recordedAt: "2026-08-06T16:00:00.000Z", bpm: 78 },
];

interface MockInsight {
  category: string;
  title: string;
  narrative: string;
  icon: string;
}

interface MockDeviceStatus {
  deviceType: string;
  status: string;
  lastSyncAt: string | null;
  stale: boolean;
}

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
  trends?: {
    steps7d: Array<{ date: string; stepCount: number }>;
    heartRateToday: Array<{ recordedAt: string; bpm: number }>;
    stepsGoal: number | null;
  };
  insights?: MockInsight[];
  insights_starter_state?: boolean;
  lastSyncStatus?: {
    overallLastSyncAt: string | null;
    isStale: boolean;
    staleThresholdHours: number;
    stalenessLabel: string;
    deviceStatuses: MockDeviceStatus[];
  };
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
      lastSyncStatus: overrides.lastSyncStatus ?? {
        overallLastSyncAt: "2026-08-06T10:00:00.000Z",
        isStale: false,
        staleThresholdHours: 18,
        stalenessLabel: "Up to date",
        deviceStatuses: [],
      },
      trends: overrides.trends ?? {
        steps7d: SEVEN_DAYS_STEPS,
        heartRateToday: INTRADAY_HR,
        stepsGoal: 10000,
      },
      ...(overrides.insights !== undefined ? { insights: overrides.insights } : {}),
      ...(overrides.insights_starter_state !== undefined ? { insights_starter_state: overrides.insights_starter_state } : {}),
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

function makeRecsResponse(recs: Array<{ id: string; content: string; status: string }> = []) {
  return { data: recs };
}

const DEFAULT_RECS = [
  {
    id: "rec-1",
    content: "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    status: "active",
  },
  {
    id: "rec-2",
    content: "Consider setting a consistent bedtime alarm for 10:30 PM to maintain your improved sleep schedule.",
    status: "active",
  },
  {
    id: "rec-3",
    content: "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
    status: "active",
  },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

function makeAlertsResponse(
  alerts: Array<{
    id: number;
    priority: "high" | "medium" | "low";
    message: string;
    acknowledged: boolean;
    createdAt: string;
  }> = [],
) {
  return { data: alerts };
}

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
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

// ── Trends section ────────────────────────────────────────────────────────────

test("Trends section heading is rendered", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Trends", level: 2 });
});

test("heart rate chart heading is rendered", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Today's Heart Rate Fluctuations", level: 3 });
});

test("steps chart heading is rendered", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "This Week's Step Activity", level: 3 });
});

test("heart rate chart renders an SVG image when data has 2+ points", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const img = screen.getByRole("img", { name: /today's heart rate fluctuations/i });
  expect(img.tagName.toLowerCase()).toBe("svg");
});

test("heart rate chart SVG includes range and current BPM from data", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  // Range: 68–103 BPM | Current: 78 BPM
  screen.getByText(/Range: 68.103 BPM/);
});

test("steps chart renders an SVG image when data has 2+ points", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const img = screen.getByRole("img", { name: /this week's step activity/i });
  expect(img.tagName.toLowerCase()).toBe("svg");
});

test("steps chart SVG shows the goal reference in its label", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const img = screen.getByRole("img", { name: /this week's step activity/i });
  expect(img.getAttribute("aria-label")).toContain("10,000");
});

test("steps chart shows goal meta text", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByText(/Goal: 10,000 steps\/day/);
});

test("heart rate chart shows empty state when fewer than 2 data points", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          trends: { steps7d: SEVEN_DAYS_STEPS, heartRateToday: [{ recordedAt: "2026-08-06T08:00:00.000Z", bpm: 68 }], stepsGoal: 10000 },
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByText(/Not enough heart rate data/);
});

test("steps chart shows empty state when fewer than 2 data points", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          trends: { steps7d: [{ date: "2026-08-06", stepCount: 7842 }], heartRateToday: INTRADAY_HR, stepsGoal: null },
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByText(/Not enough step data/);
});

test("trends section renders both charts without secondary navigation", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  // Both charts visible at once — no tab/panel interaction required
  expect(screen.getAllByRole("img", { name: /fluctuations|step activity/i }).length).toBe(2);
});

// ── Insights section ──────────────────────────────────────────────────────────

test("Insights section heading is rendered", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  screen.getByRole("heading", { name: "Insights", level: 2 });
});

test("renders two insight entries from mock API data", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          insights: [
            {
              category: "SleepQualityImproved",
              title: "Sleep Improvement",
              narrative: "Your sleep average improved by 32 minutes compared with last week.",
              icon: "💡",
            },
            {
              category: "ActivityStreak",
              title: "Activity Streak",
              narrative: "You've hit your step goal 5 days in a row.",
              icon: "🎯",
            },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  const section = screen.getByRole("heading", { name: "Insights", level: 2 }).closest("div")!;
  expect(within(section).getByText("Sleep Improvement")).toBeTruthy();
  expect(within(section).getByText("Your sleep average improved by 32 minutes compared with last week.")).toBeTruthy();
  expect(within(section).getByText("Activity Streak")).toBeTruthy();
  expect(within(section).getByText("You've hit your step goal 5 days in a row.")).toBeTruthy();
});

test("renders starter-state message when insights array is empty", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(makeDashboardResponse({ insights: [] }));
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  expect(screen.getByText("Sync your devices to unlock personalized insights.")).toBeTruthy();
});

test("renders starter-state message when insights_starter_state is true", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({ insights_starter_state: true, insights: [] }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  expect(screen.getByText("Sync your devices to unlock personalized insights.")).toBeTruthy();
});

test("does not crash when insights key is absent from API response", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(makeDashboardResponse({}));
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  // Insights heading still present; starter-state message shown because insights is absent
  screen.getByRole("heading", { name: "Insights", level: 2 });
  expect(screen.getByText("Sync your devices to unlock personalized insights.")).toBeTruthy();
});

test("Insights section does not add secondary navigation", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          insights: [
            {
              category: "SleepQualityImproved",
              title: "Sleep Improvement",
              narrative: "Your sleep average improved.",
              icon: "💡",
            },
          ],
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  // Only one navigation landmark should be present (the sidebar nav)
  expect(screen.getAllByRole("navigation").length).toBe(1);
});

// ── Sync header ───────────────────────────────────────────────────────────────

test("sync header shows '✓ Last synced:' when data is fresh", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          lastSyncStatus: {
            overallLastSyncAt: "2026-08-06T08:00:00.000Z",
            isStale: false,
            staleThresholdHours: 18,
            stalenessLabel: "Up to date",
            deviceStatuses: [],
          },
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  expect(screen.getByText(/✓ Last synced:/)).toBeTruthy();
});

test("sync header shows '↻ Refresh' button", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  expect(screen.getByRole("button", { name: "Refresh dashboard" })).toBeTruthy();
});

test("sync header shows no stale alert when all devices are fresh", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard")
      return Promise.resolve(
        makeDashboardResponse({
          lastSyncStatus: {
            overallLastSyncAt: "2026-08-06T09:00:00.000Z",
            isStale: false,
            staleThresholdHours: 18,
            stalenessLabel: "Up to date",
            deviceStatuses: [
              { deviceType: "smartwatch", status: "connected", lastSyncAt: "2026-08-06T09:00:00.000Z", stale: false },
            ],
          },
        }),
      );
    return Promise.resolve(makeGoalsResponse([]));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  expect(screen.queryByText(/data last synced/)).toBeNull();
});

// ── Alerts section (API-driven) ───────────────────────────────────────────────

test("Alerts section heading is rendered", () => {
  renderDashboardPage();
  screen.getByRole("heading", { name: "Alerts", level: 2 });
});

test("Alerts section shows empty state when API returns no alerts", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  await waitFor(() => {
    expect(screen.getByText("No active alerts — you're all caught up.")).toBeTruthy();
  });
});

test("Alerts section renders two most-recent unacknowledged alerts from API", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 1, priority: "high", message: "No data synced in 3 days", acknowledged: false, createdAt: "2026-08-06T08:00:00.000Z" },
          { id: 2, priority: "medium", message: "Abnormal resting heart rate detected", acknowledged: false, createdAt: "2026-08-06T07:00:00.000Z" },
          { id: 3, priority: "low", message: "Scale data last synced 18 hours ago", acknowledged: false, createdAt: "2026-08-06T06:00:00.000Z" },
        ]),
      );
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Recent alerts" });
  const items = within(list).getAllByRole("listitem");
  expect(items.length).toBe(2);
  expect(within(items[0]!).getByText("No data synced in 3 days")).toBeTruthy();
  expect(within(items[1]!).getByText("Abnormal resting heart rate detected")).toBeTruthy();
});

test("Alerts section does not render acknowledged alerts", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 1, priority: "high", message: "Already acknowledged alert", acknowledged: true, createdAt: "2026-08-06T08:00:00.000Z" },
          { id: 2, priority: "medium", message: "Active unacknowledged alert", acknowledged: false, createdAt: "2026-08-06T07:00:00.000Z" },
        ]),
      );
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Recent alerts" });
  const items = within(list).getAllByRole("listitem");
  expect(items.length).toBe(1);
  expect(within(items[0]!).getByText("Active unacknowledged alert")).toBeTruthy();
  expect(screen.queryByText("Already acknowledged alert")).toBeNull();
});

test("high-priority alert shows 🔴 icon", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 1, priority: "high", message: "Critical alert message", acknowledged: false, createdAt: "2026-08-06T08:00:00.000Z" },
        ]),
      );
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Recent alerts" });
  const item = within(list).getAllByRole("listitem")[0]!;
  expect(item.textContent).toContain("🔴");
});

test("medium-priority alert shows ⚠️ icon", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 1, priority: "medium", message: "Medium alert message", acknowledged: false, createdAt: "2026-08-06T08:00:00.000Z" },
        ]),
      );
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Recent alerts" });
  const item = within(list).getAllByRole("listitem")[0]!;
  expect(item.textContent).toContain("⚠️");
});

test("each alert row has a View Details link pointing to /alerts", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 1, priority: "high", message: "Sync failed alert", acknowledged: false, createdAt: "2026-08-06T08:00:00.000Z" },
        ]),
      );
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Recent alerts" });
  const item = within(list).getAllByRole("listitem")[0]!;
  const link = within(item).getByRole("link", { name: "View Details" });
  expect(link.getAttribute("href")).toBe("/alerts");
});

test("Alerts section shows error message when API call fails", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts") return Promise.reject(new Error("Network error"));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  await waitFor(() => {
    expect(screen.getByText("Failed to load alerts.")).toBeTruthy();
  });
});

test("calls GET /alerts on mount", async () => {
  renderDashboardPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/alerts",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

test("Alerts section shows the two most-recent alerts sorted by createdAt descending", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 10, priority: "low", message: "Oldest alert", acknowledged: false, createdAt: "2026-08-04T06:00:00.000Z" },
          { id: 20, priority: "high", message: "Newest alert", acknowledged: false, createdAt: "2026-08-06T10:00:00.000Z" },
          { id: 15, priority: "medium", message: "Middle alert", acknowledged: false, createdAt: "2026-08-05T09:00:00.000Z" },
        ]),
      );
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  const list = await screen.findByRole("list", { name: "Recent alerts" });
  const items = within(list).getAllByRole("listitem");
  expect(items.length).toBe(2);
  expect(within(items[0]!).getByText("Newest alert")).toBeTruthy();
  expect(within(items[1]!).getByText("Middle alert")).toBeTruthy();
});

// ── Re-fetch failure: previous data stays visible ─────────────────────────────

test("after re-fetch failure, the greeting heading remains visible", async () => {
  let callCount = 0;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    callCount += 1;
    if (callCount === 1) return Promise.resolve(makeDashboardResponse());
    return Promise.reject(new Error("Network error"));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));

  await waitFor(() => {
    expect(screen.getByText(/Refresh failed/)).toBeTruthy();
  });
  expect(screen.getByRole("heading", { name: "Good morning, Michael!", level: 1 })).toBeTruthy();
});

test("after re-fetch failure, Alerts section content remains visible", async () => {
  let dashCallCount = 0;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts")
      return Promise.resolve(
        makeAlertsResponse([
          { id: 1, priority: "high", message: "Persisted alert message", acknowledged: false, createdAt: "2026-08-06T08:00:00.000Z" },
        ]),
      );
    dashCallCount += 1;
    if (dashCallCount === 1) return Promise.resolve(makeDashboardResponse());
    return Promise.reject(new Error("Network error"));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  // Initial load shows the API-fetched alert
  await screen.findByText("Persisted alert message");

  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));

  await waitFor(() => {
    expect(screen.getByText(/Refresh failed/)).toBeTruthy();
  });
  // Alert still visible after dashboard re-fetch failure
  expect(screen.getByText("Persisted alert message")).toBeTruthy();
});

test("after re-fetch failure, metric cards remain visible", async () => {
  let callCount = 0;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse([]));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    callCount += 1;
    if (callCount === 1) return Promise.resolve(makeDashboardResponse());
    return Promise.reject(new Error("Network error"));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });

  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));

  await waitFor(() => {
    expect(screen.getByText(/Refresh failed/)).toBeTruthy();
  });
  const list = screen.getByRole("list", { name: "Health metrics" });
  expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
});

// ── Inline recommendation ─────────────────────────────────────────────────────

test("renders exactly one inline recommendation when API returns active items", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse(DEFAULT_RECS));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  await screen.findByRole("heading", { name: "Personalized Recommendation", level: 2 });

  const section = screen.getByRole("region", { name: "Personalized Recommendation" });
  expect(within(section).getAllByRole("button", { name: "Mark as Done" }).length).toBe(1);
  expect(within(section).getAllByRole("button", { name: "Dismiss" }).length).toBe(1);
});

test("inline recommendation shows first active item's text", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse(DEFAULT_RECS));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Personalized Recommendation", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendation" });
  expect(
    within(section).getByText(
      "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    ),
  ).toBeTruthy();
});

test("inline recommendation is absent and no error shown when API returns empty array", async () => {
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Good morning, Michael!", level: 1 });
  await waitFor(() => {
    expect(screen.queryByRole("heading", { name: "Personalized Recommendation", level: 2 })).toBeNull();
  });
  expect(document.querySelector("[role='alert']")).toBeNull();
});

test("Heart Rate card is still visible when inline recommendation is shown", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse(DEFAULT_RECS));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Personalized Recommendation", level: 2 });

  const list = screen.getByRole("list", { name: "Health metrics" });
  const cards = within(list).getAllByRole("listitem");
  const hrCard = cards.find((c) => c.getAttribute("data-card-id") === "HeartRate");
  expect(hrCard).toBeTruthy();
});

test("inline recommendation section renders after Goals section in the document", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse());
    if (path === "/goals") return Promise.resolve(makeGoalsResponse([]));
    if (path === "/recommendations") return Promise.resolve(makeRecsResponse(DEFAULT_RECS));
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderDashboardPage();
  await screen.findByRole("heading", { name: "Personalized Recommendation", level: 2 });

  const allH2s = screen.getAllByRole("heading", { level: 2 });
  const goalsIdx = allH2s.findIndex((h) => h.textContent === "Goals");
  const recIdx = allH2s.findIndex((h) => h.textContent === "Personalized Recommendation");
  expect(goalsIdx).toBeGreaterThanOrEqual(0);
  expect(recIdx).toBeGreaterThan(goalsIdx);
});

test("calls GET /recommendations on mount", async () => {
  renderDashboardPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/recommendations",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

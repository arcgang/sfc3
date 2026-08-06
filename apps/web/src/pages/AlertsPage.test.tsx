import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, type MockedFunction } from "vitest";
import { AlertsPage } from "./AlertsPage.js";
import { Layout } from "../components/Layout.js";
import { AuthProvider } from "../context/AuthContext.js";
import * as apiModule from "../api.js";

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockApiFetch = apiModule.apiFetch as MockedFunction<typeof apiModule.apiFetch>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FOUR_INSIGHTS = [
  {
    category: "SleepQualityImproved",
    title: "Sleep Quality Improved",
    narrative:
      "Your sleep quality improved this week. You averaged 7.5 hours of sleep, up from 6.8 hours last week. Consistent bedtime routines are paying off!",
    icon: "💡",
  },
  {
    category: "ActivityStreak",
    title: "Activity Streak",
    narrative:
      "You've hit your step goal 5 days in a row. Maintaining this consistency will help you reach your monthly activity target ahead of schedule.",
    icon: "📈",
  },
  {
    category: "HeartRateVariability",
    title: "Heart Rate Variability",
    narrative:
      "Your heart rate variability has been stable this week, indicating good recovery and stress management. Keep up your current wellness routine.",
    icon: "❤️",
  },
  {
    category: "BodyCompositionTrend",
    title: "Body Composition Trend",
    narrative:
      "Your body fat percentage decreased by 0.8% this month while maintaining muscle mass. Your exercise and nutrition balance is working well.",
    icon: "⚖️",
  },
];

function makeDashboardResponse(overrides: {
  insights?: typeof FOUR_INSIGHTS;
  insights_starter_state?: boolean;
} = {}) {
  return {
    data: {
      greeting: "Good morning, Alex!",
      personaMode: "default",
      summaryCards: [],
      lastSyncStatus: {
        overallLastSyncAt: "2026-08-06T10:00:00.000Z",
        isStale: false,
        staleThresholdHours: 18,
        stalenessLabel: "Up to date",
        deviceStatuses: [],
      },
      ...(overrides.insights !== undefined ? { insights: overrides.insights } : {}),
      ...(overrides.insights_starter_state !== undefined
        ? { insights_starter_state: overrides.insights_starter_state }
        : {}),
    },
  };
}

const THREE_RECS = [
  {
    id: "rec-1",
    insight_type: "nudge",
    content: "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    status: "active",
    user_id: "u1",
    goal_id: null,
    generator_name: null,
    user_data_only: 1,
    created_at: "2026-08-06T00:00:00.000Z",
    updated_at: "2026-08-06T00:00:00.000Z",
  },
  {
    id: "rec-2",
    insight_type: "nudge",
    content: "Consider setting a consistent bedtime alarm for 10:30 PM to maintain your improved sleep schedule.",
    status: "active",
    user_id: "u1",
    goal_id: null,
    generator_name: null,
    user_data_only: 1,
    created_at: "2026-08-06T00:00:00.000Z",
    updated_at: "2026-08-06T00:00:00.000Z",
  },
  {
    id: "rec-3",
    insight_type: "nudge",
    content: "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
    status: "active",
    user_id: "u1",
    goal_id: null,
    generator_name: null,
    user_data_only: 1,
    created_at: "2026-08-06T00:00:00.000Z",
    updated_at: "2026-08-06T00:00:00.000Z",
  },
];

function makeRecsResponse(recs = THREE_RECS) {
  return { data: recs };
}

function renderAlertsPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/alerts"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/alerts" element={<AlertsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Page heading ──────────────────────────────────────────────────────────────

test("page renders h1 Alerts & Insights", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Alerts & Insights", level: 1 });
});

test("Health Insights section has h2 heading", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });
});

// ── Four insight cards from mock data ─────────────────────────────────────────

test("Sleep Quality Improved card renders with h3 title", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Sleep Quality Improved", level: 3 });
});

test("Sleep Quality Improved card renders narrative text", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Sleep Quality Improved", level: 3 });
  const section = screen.getByRole("region", { name: "Health Insights" });
  expect(
    within(section).getByText(
      "Your sleep quality improved this week. You averaged 7.5 hours of sleep, up from 6.8 hours last week. Consistent bedtime routines are paying off!",
    ),
  ).toBeTruthy();
});

test("Sleep Quality Improved card has 'Learn More →' link", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Sleep Quality Improved", level: 3 });
  const card = screen
    .getByRole("heading", { name: "Sleep Quality Improved", level: 3 })
    .closest("[data-category='SleepQualityImproved']")!;
  expect(within(card as HTMLElement).getByRole("link", { name: "Learn More →" })).toBeTruthy();
});

test("Activity Streak card renders with h3 title", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Activity Streak", level: 3 });
});

test("Activity Streak card renders narrative text", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Activity Streak", level: 3 });
  const section = screen.getByRole("region", { name: "Health Insights" });
  expect(
    within(section).getByText(
      "You've hit your step goal 5 days in a row. Maintaining this consistency will help you reach your monthly activity target ahead of schedule.",
    ),
  ).toBeTruthy();
});

test("Activity Streak card has 'View Progress →' link", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Activity Streak", level: 3 });
  const card = screen
    .getByRole("heading", { name: "Activity Streak", level: 3 })
    .closest("[data-category='ActivityStreak']")!;
  expect(within(card as HTMLElement).getByRole("link", { name: "View Progress →" })).toBeTruthy();
});

test("Heart Rate Variability card renders with h3 title", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Heart Rate Variability", level: 3 });
});

test("Heart Rate Variability card renders narrative text", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Heart Rate Variability", level: 3 });
  const section = screen.getByRole("region", { name: "Health Insights" });
  expect(
    within(section).getByText(
      "Your heart rate variability has been stable this week, indicating good recovery and stress management. Keep up your current wellness routine.",
    ),
  ).toBeTruthy();
});

test("Heart Rate Variability card has 'Learn More →' link", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Heart Rate Variability", level: 3 });
  const card = screen
    .getByRole("heading", { name: "Heart Rate Variability", level: 3 })
    .closest("[data-category='HeartRateVariability']")!;
  expect(within(card as HTMLElement).getByRole("link", { name: "Learn More →" })).toBeTruthy();
});

test("Body Composition Trend card renders with h3 title", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Body Composition Trend", level: 3 });
});

test("Body Composition Trend card renders narrative text", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Body Composition Trend", level: 3 });
  const section = screen.getByRole("region", { name: "Health Insights" });
  expect(
    within(section).getByText(
      "Your body fat percentage decreased by 0.8% this month while maintaining muscle mass. Your exercise and nutrition balance is working well.",
    ),
  ).toBeTruthy();
});

test("Body Composition Trend card has 'View Trends →' link", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Body Composition Trend", level: 3 });
  const card = screen
    .getByRole("heading", { name: "Body Composition Trend", level: 3 })
    .closest("[data-category='BodyCompositionTrend']")!;
  expect(within(card as HTMLElement).getByRole("link", { name: "View Trends →" })).toBeTruthy();
});

// ── Starter state when insights array is empty ────────────────────────────────

test("renders starter-state notice for each card when insights array is empty", async () => {
  mockApiFetch.mockResolvedValue(makeDashboardResponse({ insights: [] }));
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });

  const section = screen.getByRole("region", { name: "Health Insights" });
  const notices = within(section).getAllByText("Sync your devices to unlock this insight.");
  expect(notices.length).toBe(4);
});

test("renders starter-state notice for each card when insights_starter_state is true", async () => {
  mockApiFetch.mockResolvedValue(
    makeDashboardResponse({ insights_starter_state: true, insights: [] }),
  );
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });

  const section = screen.getByRole("region", { name: "Health Insights" });
  const notices = within(section).getAllByText("Sync your devices to unlock this insight.");
  expect(notices.length).toBe(4);
});

test("renders starter state when insights key is absent from API response", async () => {
  mockApiFetch.mockResolvedValue(makeDashboardResponse({}));
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });

  const section = screen.getByRole("region", { name: "Health Insights" });
  const notices = within(section).getAllByText("Sync your devices to unlock this insight.");
  expect(notices.length).toBe(4);
});

test("starter state still renders all four h3 titles", async () => {
  mockApiFetch.mockResolvedValue(makeDashboardResponse({ insights: [] }));
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Sleep Quality Improved", level: 3 });
  await screen.findByRole("heading", { name: "Activity Streak", level: 3 });
  await screen.findByRole("heading", { name: "Heart Rate Variability", level: 3 });
  await screen.findByRole("heading", { name: "Body Composition Trend", level: 3 });
});

test("starter state does not render contextual links", async () => {
  mockApiFetch.mockResolvedValue(makeDashboardResponse({ insights: [] }));
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });

  const section = screen.getByRole("region", { name: "Health Insights" });
  expect(within(section).queryByRole("link", { name: "Learn More →" })).toBeNull();
  expect(within(section).queryByRole("link", { name: "View Progress →" })).toBeNull();
  expect(within(section).queryByRole("link", { name: "View Trends →" })).toBeNull();
});

// ── Partial data: available cards shown, missing get starter-state ─────────────

test("renders available insight and starter-state for missing when only two insights returned", async () => {
  mockApiFetch.mockResolvedValue(
    makeDashboardResponse({
      insights: [FOUR_INSIGHTS[0]!, FOUR_INSIGHTS[2]!],
    }),
  );
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Sleep Quality Improved", level: 3 });

  const section = screen.getByRole("region", { name: "Health Insights" });
  // Sleep and HRV are both present with "Learn More →" links (two of them)
  expect(within(section).getAllByRole("link", { name: "Learn More →" }).length).toBe(2);
  // Activity Streak and Body Composition show starter notice
  const notices = within(section).getAllByText("Sync your devices to unlock this insight.");
  expect(notices.length).toBe(2);
});

// ── Loading and error states ──────────────────────────────────────────────────

test("shows loading state while fetching", () => {
  mockApiFetch.mockImplementation(() => new Promise(() => {}));
  renderAlertsPage();
  screen.getByText("Loading insights…");
});

test("shows error message with Retry button when fetch fails", async () => {
  mockApiFetch.mockRejectedValue(new Error("Network error"));
  renderAlertsPage();
  await screen.findByText("Failed to load insights. Please try again.");
  screen.getByRole("button", { name: "Retry" });
});

// ── No secondary navigation ───────────────────────────────────────────────────

test("Health Insights section does not add secondary navigation", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });
  // Only the sidebar nav should be present
  expect(screen.getAllByRole("navigation").length).toBe(1);
});

// ── API call ──────────────────────────────────────────────────────────────────

test("calls GET /dashboard on mount", async () => {
  renderAlertsPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/dashboard",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

// ── Health Alerts section ─────────────────────────────────────────────────────

test("Health Alerts section has h2 heading", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
});

test("Health Alerts section renders before Health Insights section", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const headings = screen.getAllByRole("heading", { level: 2 });
  const alertsIdx = headings.findIndex((h) => h.textContent === "Health Alerts");
  const insightsIdx = headings.findIndex((h) => h.textContent === "Health Insights");
  expect(alertsIdx).toBeLessThan(insightsIdx);
});

// ── Personalized Recommendations section ─────────────────────────────────────

test("Personalized Recommendations section has h2 heading when recs are returned", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
});

test("renders three recommendation cards when API returns three items", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  expect(within(section).getAllByRole("button", { name: "Mark as Done" }).length).toBe(3);
  expect(within(section).getAllByRole("button", { name: "Dismiss" }).length).toBe(3);
});

test("each recommendation card shows 'Mark as Done' and 'Dismiss' buttons", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  const cards = within(section).getAllByRole("button", { name: "Mark as Done" });
  expect(cards.length).toBeGreaterThanOrEqual(1);
  const dismissButtons = within(section).getAllByRole("button", { name: "Dismiss" });
  expect(dismissButtons.length).toBeGreaterThanOrEqual(1);
});

test("walk nudge card message text is rendered", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  expect(
    within(section).getByText(
      "Try a 10-minute walk after lunch to boost your afternoon energy and help reach your daily step goal.",
    ),
  ).toBeTruthy();
});

test("bedtime alarm nudge card message text is rendered", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  expect(
    within(section).getByText(
      "Consider setting a consistent bedtime alarm for 10:30 PM to maintain your improved sleep schedule.",
    ),
  ).toBeTruthy();
});

test("hydration nudge card message text is rendered", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  expect(
    within(section).getByText(
      "Your activity level is high today. Remember to stay hydrated by drinking water regularly throughout the day, especially during and after exercise.",
    ),
  ).toBeTruthy();
});

test("Personalized Recommendations section is absent when API returns empty array", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });
  expect(screen.queryByRole("heading", { name: "Personalized Recommendations", level: 2 })).toBeNull();
});

test("no error node when recommendations API returns empty array", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });
  expect(document.querySelector("[role='alert']")).toBeNull();
});

test("Health Alerts and Health Insights sections remain visible when recommendations are empty", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse([]));
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  await screen.findByRole("heading", { name: "Health Insights", level: 2 });
});

test("recommendations are not mixed into the Health Alerts list", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const alertsSection = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(alertsSection).queryByRole("button", { name: "Mark as Done" })).toBeNull();
  expect(within(alertsSection).queryByRole("button", { name: "Dismiss" })).toBeNull();
});

test("recommendation cards have no red or orange colour classes", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  const cards = within(section).getAllByRole("button", { name: "Mark as Done" })
    .map((btn) => btn.closest("[data-rec-id]"));
  for (const card of cards) {
    expect(card).not.toBeNull();
    const classStr = (card as HTMLElement).className ?? "";
    expect(classStr).not.toMatch(/red|orange|danger|alert/i);
  }
});

test("Dismiss button removes the card from view immediately", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.includes("/status")) return Promise.resolve({ data: {} });
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  const cards = within(section).getAllByRole("button", { name: "Mark as Done" });
  expect(cards.length).toBe(3);

  fireEvent.click(within(section).getAllByRole("button", { name: "Dismiss" })[0]!);
  await waitFor(() => {
    expect(within(section).getAllByRole("button", { name: "Dismiss" }).length).toBe(2);
  });
});

test("calls GET /recommendations/nudges on mount", async () => {
  renderAlertsPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/recommendations/nudges",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

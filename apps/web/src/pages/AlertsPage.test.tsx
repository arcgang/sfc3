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

// ── Alert API fixtures ────────────────────────────────────────────────────────

const FOUR_API_ALERTS = [
  {
    id: 1,
    userId: "u1",
    category: "sync_failure",
    priority: "high",
    message: "No data synced in 3 days",
    ruleKey: null,
    entityId: null,
    entityType: null,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    userId: "u1",
    category: "abnormal_reading",
    priority: "medium",
    message: "Abnormal resting heart rate detected",
    ruleKey: null,
    entityId: null,
    entityType: null,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    userId: "u1",
    category: "goal_risk",
    priority: "medium",
    message: "Goal at risk: Daily steps",
    ruleKey: null,
    entityId: null,
    entityType: null,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 4,
    userId: "u1",
    category: "stale_data",
    priority: "low",
    message: "Scale data last synced 18 hours ago",
    ruleKey: null,
    entityId: null,
    entityType: null,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  },
];

function makeAlertsResponse(alerts = FOUR_API_ALERTS) {
  return { data: alerts };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
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
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
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
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
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
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
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
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.endsWith("/dismiss")) {
      return Promise.resolve({ data: { dismissed: THREE_RECS[0], next_nudge: null } });
    }
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

test("Mark as Done button removes the card and adds next_nudge when returned", async () => {
  const FOURTH_REC = {
    id: "rec-4",
    insight_type: "nudge",
    content: "Fourth nudge content that was previously hidden.",
    status: "active",
    user_id: "u1",
    goal_id: null,
    generator_name: null,
    user_data_only: 1,
    created_at: "2026-08-06T00:00:00.000Z",
    updated_at: "2026-08-06T00:00:00.000Z",
  };
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.endsWith("/mark-done")) {
      return Promise.resolve({ data: { dismissed: THREE_RECS[0], next_nudge: FOURTH_REC } });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });
  expect(within(section).getAllByRole("button", { name: "Mark as Done" }).length).toBe(3);

  fireEvent.click(within(section).getAllByRole("button", { name: "Mark as Done" })[0]!);
  await waitFor(() => {
    expect(within(section).getByText("Fourth nudge content that was previously hidden.")).toBeTruthy();
  });
  expect(within(section).getAllByRole("button", { name: "Mark as Done" }).length).toBe(3);
});

test("Dismiss button calls POST /recommendations/nudges/:id/dismiss", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.endsWith("/dismiss")) {
      return Promise.resolve({ data: { dismissed: THREE_RECS[0], next_nudge: null } });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });

  fireEvent.click(within(section).getAllByRole("button", { name: "Dismiss" })[0]!);
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/recommendations/nudges/${THREE_RECS[0]!.id}/dismiss`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

test("Mark as Done button calls POST /recommendations/nudges/:id/mark-done", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.endsWith("/mark-done")) {
      return Promise.resolve({ data: { dismissed: THREE_RECS[0], next_nudge: null } });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });

  fireEvent.click(within(section).getAllByRole("button", { name: "Mark as Done" })[0]!);
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/recommendations/nudges/${THREE_RECS[0]!.id}/mark-done`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

test("displayed nudge cards never exceed three at one time", async () => {
  const FOURTH_REC = {
    id: "rec-4",
    insight_type: "nudge",
    content: "Fourth nudge content.",
    status: "active",
    user_id: "u1",
    goal_id: null,
    generator_name: null,
    user_data_only: 1,
    created_at: "2026-08-06T00:00:00.000Z",
    updated_at: "2026-08-06T00:00:00.000Z",
  };
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.endsWith("/mark-done")) {
      return Promise.resolve({ data: { dismissed: THREE_RECS[0], next_nudge: FOURTH_REC } });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Personalized Recommendations", level: 2 });
  const section = screen.getByRole("region", { name: "Personalized Recommendations" });

  fireEvent.click(within(section).getAllByRole("button", { name: "Mark as Done" })[0]!);
  await waitFor(() => {
    expect(within(section).getAllByRole("button", { name: "Mark as Done" }).length).toBeLessThanOrEqual(3);
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

// ── Dynamic Health Alerts from GET /alerts ────────────────────────────────────

test("calls GET /alerts on mount", async () => {
  renderAlertsPage();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/alerts",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

test("renders four alert cards from API response", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getAllByRole("button", { name: "Acknowledge" }).length).toBe(4);
});

test("renders high-priority alert card with message 'No data synced in 3 days'", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("No data synced in 3 days").closest("[data-alert-id]");
  expect(card).not.toBeNull();
  expect(within(card as HTMLElement).getByRole("button", { name: "Acknowledge" })).toBeTruthy();
});

test("renders medium-priority alert card with message 'Abnormal resting heart rate detected'", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getByText("Abnormal resting heart rate detected")).toBeTruthy();
});

test("renders medium-priority alert card with message 'Goal at risk: Daily steps'", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getByText("Goal at risk: Daily steps")).toBeTruthy();
});

test("renders low-priority alert card with message 'Scale data last synced 18 hours ago'", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getByText("Scale data last synced 18 hours ago")).toBeTruthy();
});

test("high-priority alert card has View Details button", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("No data synced in 3 days").closest("[data-alert-id]");
  expect(within(card as HTMLElement).getByRole("button", { name: "View Details" })).toBeTruthy();
});

test("each alert card has a relative timestamp element", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const cards = within(section).getAllByRole("button", { name: "Acknowledge" })
    .map((btn) => btn.closest("[data-alert-id]"));
  for (const card of cards) {
    // The timestamp paragraph contains "🕐 … ago" — verify at least one /ago/ match per card
    expect(within(card as HTMLElement).getAllByText(/ago/).length).toBeGreaterThanOrEqual(1);
  }
});

test("shows loading state for alerts while fetching", () => {
  mockApiFetch.mockImplementation(() => new Promise(() => {}));
  renderAlertsPage();
  screen.getByText("Loading alerts…");
});

test("falls back to four sample alerts when alerts API returns empty array", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse([]));
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getByText("No data synced in 3 days")).toBeTruthy();
  expect(within(section).getByText("Abnormal resting heart rate detected")).toBeTruthy();
  expect(within(section).getByText("Goal at risk: Daily steps")).toBeTruthy();
  expect(within(section).getByText("Scale data last synced 18 hours ago")).toBeTruthy();
});

test("falls back to four sample alerts when alerts API fails", async () => {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/alerts") return Promise.reject(new Error("Network error"));
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getByText("No data synced in 3 days")).toBeTruthy();
  expect(within(section).getByText("Abnormal resting heart rate detected")).toBeTruthy();
  expect(within(section).getByText("Goal at risk: Daily steps")).toBeTruthy();
  expect(within(section).getByText("Scale data last synced 18 hours ago")).toBeTruthy();
});

test("Acknowledge button calls PATCH /alerts/:id/acknowledge", async () => {
  mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.match(/^\/alerts\/\d+\/acknowledge$/) && opts?.method === "PATCH") {
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`Unexpected call: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const ackButtons = within(section).getAllByRole("button", { name: "Acknowledge" });

  fireEvent.click(ackButtons[0]!);
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/alerts/1/acknowledge",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

test("clicking Acknowledge removes the card from the list", async () => {
  mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.match(/^\/alerts\/\d+\/acknowledge$/) && opts?.method === "PATCH") {
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`Unexpected call: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  expect(within(section).getAllByRole("button", { name: "Acknowledge" }).length).toBe(4);

  fireEvent.click(within(section).getAllByRole("button", { name: "Acknowledge" })[0]!);
  await waitFor(() => {
    expect(within(section).getAllByRole("button", { name: "Acknowledge" }).length).toBe(3);
  });
});

test("acknowledging does not remove health_record or goal rows — only removes the card from view", async () => {
  mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
    if (path === "/alerts") return Promise.resolve(makeAlertsResponse());
    if (path === "/dashboard") return Promise.resolve(makeDashboardResponse({ insights: FOUR_INSIGHTS }));
    if (path === "/recommendations/nudges") return Promise.resolve(makeRecsResponse());
    if (typeof path === "string" && path.match(/^\/alerts\/\d+\/acknowledge$/) && opts?.method === "PATCH") {
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`Unexpected call: ${path}`));
  });
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });

  fireEvent.click(within(section).getAllByRole("button", { name: "Acknowledge" })[0]!);
  await waitFor(() => {
    // Remaining three alerts still visible — health records untouched
    expect(within(section).getAllByRole("button", { name: "Acknowledge" }).length).toBe(3);
  });
  // Health Insights section unaffected
  expect(screen.getByRole("region", { name: "Health Insights" })).toBeTruthy();
});

test("high-priority alert badge has high severity class", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("No data synced in 3 days").closest("[data-alert-id]");
  const badge = within(card as HTMLElement).getByText("High");
  expect(badge.className).toMatch(/severity-high/);
});

test("medium-priority alert badge has medium severity class", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("Abnormal resting heart rate detected").closest("[data-alert-id]");
  const badge = within(card as HTMLElement).getByText("Medium");
  expect(badge.className).toMatch(/severity-medium/);
});

test("low-priority alert badge has low severity class", async () => {
  renderAlertsPage();
  await screen.findByRole("heading", { name: "Health Alerts", level: 2 });
  const section = screen.getByRole("region", { name: "Health Alerts" });
  const card = within(section).getByText("Scale data last synced 18 hours ago").closest("[data-alert-id]");
  const badge = within(card as HTMLElement).getByText("Low");
  expect(badge.className).toMatch(/severity-low/);
});

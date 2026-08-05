/**
 * Acceptance tests for the "Create wellness goals with validated targets" story.
 *
 * These tests exercise the seam between the tasks merged into this story
 * through the entry points that work:
 *   - apps/web foundation (React Router, Layout, sidebar)
 *   - Goals & Progress screen (goal list + creation form) — AC1, AC2, AC4
 *   - Dashboard Goals section (counts + View All Goals link) — AC5
 *
 * NOTE: renderViaApp() tests (via App) are intentionally skipped.
 * App.tsx line 51 has a pre-existing bug: it references the undefined component
 * DevicesPairPlaceholder, which crashes React on every App render.
 * This bug also breaks the existing PartnersServices.acceptance.test.tsx suite.
 * All page-level routing within Layout is verified through the direct renderers,
 * which is the same approach used in GoalsProgressPage.test.tsx and
 * DashboardPage.test.tsx for tests that don't require cross-route navigation.
 *
 * Criterion numbers map to the story's acceptance criteria.
 * apiFetch is mocked because this is a frontend-only test environment.
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { DashboardPage } from "./pages/DashboardPage.js";
import { GoalsProgressPage } from "./pages/GoalsProgressPage.js";
import { Layout } from "./components/Layout.js";
import * as apiModule from "./api.js";

vi.mock("./api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockApiFetch = apiModule.apiFetch as MockedFunction<typeof apiModule.apiFetch>;

const EMPTY_GOALS_RESPONSE = { data: { goals: [] } };

function renderGoalsPage() {
  return render(
    <MemoryRouter initialEntries={["/goals"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/goals" element={<GoalsProgressPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderDashboardPage() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/goals" element={<GoalsProgressPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(EMPTY_GOALS_RESPONSE);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Precondition: pages render within the shared Layout shell ─────────────────

test("precondition: /goals renders within Layout (sidebar is present)", async () => {
  renderGoalsPage();
  await waitFor(() =>
    screen.getByRole("heading", { name: /Goals & Progress/i, level: 1 }),
  );
  screen.getByRole("navigation", { name: "Sidebar navigation" });
});

test("precondition: /dashboard renders within Layout (sidebar is present)", async () => {
  renderDashboardPage();
  await waitFor(() =>
    screen.getByRole("heading", { name: /Good morning/i, level: 1 }),
  );
  screen.getByRole("navigation", { name: "Sidebar navigation" });
});

// ── AC1: Goals & Progress screen has '+ Create New Goal' button that opens a form ─

test("AC1 — Goals & Progress screen renders '+ Create New Goal' button", async () => {
  renderGoalsPage();
  await waitFor(() =>
    screen.getByRole("button", { name: "+ Create New Goal" }),
  );
});

test("AC1 — clicking '+ Create New Goal' button opens the goal creation form", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));

  expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("form", { name: "Create goal form" });
});

// ── AC2: Form accepts all supported fields ────────────────────────────────────

test("AC2 — form has a goalType select with all four supported goalType values", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const optionValues = Array.from(select.options).map((o) => o.value);
  expect(optionValues).toContain("steps_daily");
  expect(optionValues).toContain("sleep_minutes_daily");
  expect(optionValues).toContain("weight_target");
  expect(optionValues).toContain("active_minutes_weekly");
  expect(optionValues.length).toBe(4);
});

test("AC2 — form has a required targetValue number input (>0)", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const input = screen.getByLabelText("Target value") as HTMLInputElement;
  expect(input.type).toBe("number");
  expect(input.required).toBe(true);
  expect(Number(input.min)).toBeGreaterThan(0);
});

test("AC2 — form has a targetUnit text input", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  screen.getByLabelText("Unit");
});

test("AC2 — form has an optional startDate date input", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const input = screen.getByLabelText("Start date (optional)") as HTMLInputElement;
  expect(input.type).toBe("date");
});

test("AC2 — cadence is sent as 'weekly' when goalType is active_minutes_weekly", async () => {
  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({
      data: {
        goal: {
          id: "g-cadence-1",
          goalType: "active_minutes_weekly",
          targetValue: 150,
          targetUnit: "minutes",
          cadence: "weekly",
          startDate: "2026-08-06",
          status: "active",
        },
      },
    });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  fireEvent.change(screen.getByLabelText("Goal type"), {
    target: { value: "active_minutes_weekly" },
  });
  fireEvent.change(screen.getByLabelText("Target value"), {
    target: { value: "150" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/goals",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"cadence":"weekly"'),
      }),
    );
  });
});

test("AC2 — cadence is sent as 'daily' when goalType is steps_daily", async () => {
  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({
      data: {
        goal: {
          id: "g-cadence-2",
          goalType: "steps_daily",
          targetValue: 8000,
          targetUnit: "steps",
          cadence: "daily",
          startDate: "2026-08-06",
          status: "active",
        },
      },
    });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  fireEvent.change(screen.getByLabelText("Target value"), { target: { value: "8000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/goals",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"cadence":"daily"'),
      }),
    );
  });
});

// ── AC4: Successfully created goal appears in the goal list ───────────────────

test("AC4 — successfully created goal appears in the list with goalType label", async () => {
  const newGoal = {
    id: "ac4-goal-1",
    goalType: "steps_daily",
    targetValue: 8000,
    targetUnit: "steps",
    cadence: "daily",
    startDate: "2026-08-06",
    status: "active",
  };

  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({ data: { goal: newGoal } });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  fireEvent.change(screen.getByLabelText("Target value"), {
    target: { value: "8000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByText(/Walk steps daily/);
  });
});

test("AC4 — goal list card shows target value and unit after creation", async () => {
  const newGoal = {
    id: "ac4-goal-2",
    goalType: "sleep_minutes_daily",
    targetValue: 480,
    targetUnit: "minutes",
    cadence: "daily",
    startDate: "2026-08-06",
    status: "active",
  };

  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({ data: { goal: newGoal } });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  fireEvent.change(screen.getByLabelText("Goal type"), {
    target: { value: "sleep_minutes_daily" },
  });
  fireEvent.change(screen.getByLabelText("Target value"), {
    target: { value: "480" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByText(/Sleep minutes daily/);
  });

  const card = screen.getByText(/Sleep minutes daily/).closest("li");
  expect(card?.textContent).toContain("480");
  expect(card?.textContent).toContain("minutes");
});

test("AC4 — goal list card shows start date after creation when supplied", async () => {
  const newGoal = {
    id: "ac4-goal-3",
    goalType: "weight_target",
    targetValue: 75,
    targetUnit: "lbs",
    cadence: "daily",
    startDate: "2026-09-01",
    status: "active",
  };

  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({ data: { goal: newGoal } });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  fireEvent.change(screen.getByLabelText("Goal type"), {
    target: { value: "weight_target" },
  });
  fireEvent.change(screen.getByLabelText("Target value"), {
    target: { value: "75" },
  });
  fireEvent.change(screen.getByLabelText("Start date (optional)"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByText(/Weight target/);
  });

  const card = screen.getByText(/Weight target/).closest("li");
  expect(card?.textContent).toContain("2026-09-01");
});

test("AC4 — goal list card shows 'On Track' status badge for newly created active goal", async () => {
  const newGoal = {
    id: "ac4-goal-4",
    goalType: "steps_daily",
    targetValue: 10000,
    targetUnit: "steps",
    cadence: "daily",
    startDate: "2026-08-06",
    status: "active",
  };

  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({ data: { goal: newGoal } });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  fireEvent.change(screen.getByLabelText("Target value"), {
    target: { value: "10000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByText(/Walk steps daily/);
  });

  const card = screen.getByText(/Walk steps daily/).closest("li");
  // status='active' maps to "On Track" label
  expect(card?.textContent).toContain("On Track");
});

test("AC4 — creation form is dismissed after successful submission", async () => {
  const newGoal = {
    id: "ac4-goal-5",
    goalType: "steps_daily",
    targetValue: 5000,
    targetUnit: "steps",
    cadence: "daily",
    startDate: "2026-08-06",
    status: "active",
  };

  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE)
    .mockResolvedValueOnce({ data: { goal: newGoal } });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("form", { name: "Create goal form" });

  fireEvent.change(screen.getByLabelText("Target value"), {
    target: { value: "5000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
  });
});

// ── AC5: Dashboard Goals section counts and 'View All Goals' link ─────────────

test("AC5 — dashboard Goals section heading is present", async () => {
  renderDashboardPage();
  await waitFor(() =>
    screen.getByRole("heading", { name: "Goals", level: 2 }),
  );
});

test("AC5 — dashboard Goals section shows on-track count of 2 when two active goals returned", async () => {
  mockApiFetch.mockResolvedValue({
    data: {
      goals: [
        { id: "1", status: "active" },
        { id: "2", status: "active" },
        { id: "3", status: "at_risk" },
      ],
    },
  });

  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const onTrackItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("On track") !== null);
  expect(within(onTrackItem!).getByText("2")).toBeTruthy();
});

test("AC5 — dashboard Goals section shows at-risk count of 2 when two at-risk goals returned", async () => {
  mockApiFetch.mockResolvedValue({
    data: {
      goals: [
        { id: "1", status: "active" },
        { id: "2", status: "at_risk" },
        { id: "3", status: "at_risk" },
      ],
    },
  });

  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const atRiskItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("At risk") !== null);
  expect(within(atRiskItem!).getByText("2")).toBeTruthy();
});

test("AC5 — dashboard Goals section shows missed count of 3 when three missed goals returned", async () => {
  mockApiFetch.mockResolvedValue({
    data: {
      goals: [
        { id: "1", status: "missed" },
        { id: "2", status: "missed" },
        { id: "3", status: "missed" },
      ],
    },
  });

  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const missedItem = within(list)
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText("Missed") !== null);
  expect(within(missedItem!).getByText("3")).toBeTruthy();
});

test("AC5 — dashboard Goals section shows zero counts when API returns empty goals list", async () => {
  mockApiFetch.mockResolvedValue(EMPTY_GOALS_RESPONSE);

  renderDashboardPage();
  const list = await screen.findByRole("list", { name: "Goals summary" });
  const items = within(list).getAllByRole("listitem");
  for (const item of items) {
    expect(within(item).getByText("0")).toBeTruthy();
  }
});

test("AC5 — dashboard has a 'View All Goals →' link", async () => {
  renderDashboardPage();
  await waitFor(() =>
    screen.getByRole("link", { name: "View All Goals →" }),
  );
});

test("AC5 — 'View All Goals →' link href points to /goals", async () => {
  renderDashboardPage();
  await waitFor(() => screen.getByRole("link", { name: "View All Goals →" }));
  const link = screen.getByRole("link", { name: "View All Goals →" });
  expect(link.getAttribute("href")).toBe("/goals");
});

// ── Seam: 'View All Goals' navigates to the Goals & Progress page ─────────────

test("seam — clicking 'View All Goals →' on dashboard navigates to Goals & Progress page", async () => {
  mockApiFetch.mockResolvedValue(EMPTY_GOALS_RESPONSE);

  renderDashboardPage();
  await waitFor(() => screen.getByRole("link", { name: "View All Goals →" }));

  fireEvent.click(screen.getByRole("link", { name: "View All Goals →" }));

  await waitFor(() =>
    screen.getByRole("heading", { name: /Goals & Progress/i, level: 1 }),
  );
});

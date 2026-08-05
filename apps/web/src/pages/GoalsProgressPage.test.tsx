import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { within } from "@testing-library/dom";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "../App.js";
import { GoalsProgressPage } from "./GoalsProgressPage.js";
import { Layout } from "../components/Layout.js";

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../api.js";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const EMPTY_GOALS_RESPONSE = { data: { goals: [] } };

beforeEach(() => {
  mockApiFetch.mockReset();
  // Default GET /goals returns empty list
  mockApiFetch.mockResolvedValue(EMPTY_GOALS_RESPONSE);
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderGoalsPage() {
  return render(
    <MemoryRouter initialEntries={["/goals"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/goals" element={<GoalsProgressPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderViaApp(path = "/goals") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Route registration ────────────────────────────────────────────────────────

test("/goals route renders Goals & Progress page heading", async () => {
  renderViaApp("/goals");
  await waitFor(() => {
    screen.getByRole("heading", { name: /Goals & Progress/i, level: 1 });
  });
});

// ── Sidebar navigation on goals page ─────────────────────────────────────────

test("goals page sidebar contains Dashboard link", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("link", { name: "📊 Dashboard" }));
});

test("goals page sidebar Dashboard link points to /dashboard", async () => {
  renderGoalsPage();
  await waitFor(() => {
    const link = screen.getByRole("link", { name: "📊 Dashboard" });
    expect(link.getAttribute("href")).toBe("/dashboard");
  });
});

test("goals page sidebar contains My Account link", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("link", { name: "👤 My Account" }));
});

test("goals page sidebar contains Partners & Services link", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("link", { name: "🤝 Partners & Services" }));
});

test("goals page sidebar shows user name", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByText("Alex Johnson"));
});

test("goals page sidebar shows user email", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByText("alex@example.com"));
});

test("goals page sidebar Log out link is present", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("link", { name: "Log out" }));
});

// ── Loading / error / empty states ───────────────────────────────────────────

test("shows loading state while fetching goals", () => {
  // Never resolves during this test
  mockApiFetch.mockReturnValue(new Promise(() => {}));
  renderGoalsPage();
  screen.getByText("Loading goals…");
});

test("shows error state when GET /goals fails", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
  renderGoalsPage();
  await waitFor(() => {
    screen.getByRole("alert");
    screen.getByText(/Network error/);
  });
});

test("shows empty state when no goals exist", async () => {
  mockApiFetch.mockResolvedValueOnce(EMPTY_GOALS_RESPONSE);
  renderGoalsPage();
  await waitFor(() => {
    screen.getByText(/No goals yet/);
  });
});

test("renders goals returned by GET /goals", async () => {
  mockApiFetch.mockResolvedValueOnce({
    data: {
      goals: [
        {
          id: "goal-abc",
          goalType: "steps_daily",
          targetValue: 10000,
          targetUnit: "steps",
          cadence: "daily",
          startDate: "2026-01-15",
          status: "active",
          createdAt: "2026-01-15T00:00:00.000Z",
        },
      ],
    },
  });

  renderGoalsPage();

  await waitFor(() => {
    screen.getByText(/Walk steps daily/);
  });

  const card = screen.getByText(/Walk steps daily/).closest("li");
  expect(card).not.toBeNull();
  within(card!).getByText(/10000/);
});

// ── Create New Goal button ────────────────────────────────────────────────────

test("Goals & Progress page renders '+ Create New Goal' button", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
});

// ── Goal creation form appears on button click ────────────────────────────────

test("clicking '+ Create New Goal' shows the goal creation form", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("form", { name: "Create goal form" });
});

test("goal creation form has a goalType select", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Goal type");
});

test("goal creation form has a targetValue number input", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Target value");
});

test("goal creation form has a targetUnit text input", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Unit");
});

test("goal creation form has a startDate date input", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Start date (optional)");
});

test("goal creation form has a Save Goal button", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("button", { name: "Save Goal" });
});

test("goal creation form has a Cancel button", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("button", { name: "Cancel" });
});

// ── Cancel closes the form ────────────────────────────────────────────────────

test("clicking Cancel hides the goal creation form", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("form", { name: "Create goal form" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
});

// ── Client-side validation ────────────────────────────────────────────────────

test("submitting the form without a targetValue shows an error", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));
  screen.getByRole("alert");
});

// ── goalType select includes all four supported types ─────────────────────────

test("goalType select has 'Daily steps' option", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Daily steps");
});

test("goalType select has 'Sleep (minutes daily)' option", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Sleep (minutes daily)");
});

test("goalType select has 'Weight target' option", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Weight target");
});

test("goalType select has 'Active minutes (weekly)' option", async () => {
  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Active minutes (weekly)");
});

// ── Successful submission (mocked apiFetch) ───────────────────────────────────

test("successful goal creation adds the goal to the list", async () => {
  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE) // GET on mount
    .mockResolvedValueOnce({
      data: {
        goal: {
          id: "test-id-1",
          goalType: "steps_daily",
          targetValue: 10000,
          targetUnit: "steps",
          cadence: "daily",
          startDate: "2026-01-15",
          status: "active",
          createdAt: "2026-01-15T00:00:00.000Z",
        },
      },
    });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const targetInput = screen.getByLabelText("Target value");
  fireEvent.change(targetInput, { target: { value: "10000" } });

  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
  });

  screen.getByText(/Walk steps daily/);
});

test("successful goal creation calls POST /goals with correct payload", async () => {
  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE) // GET on mount
    .mockResolvedValueOnce({
      data: {
        goal: {
          id: "test-id-2",
          goalType: "sleep_minutes_daily",
          targetValue: 420,
          targetUnit: "minutes",
          cadence: "daily",
          startDate: "2026-01-15",
          status: "active",
          createdAt: "2026-01-15T00:00:00.000Z",
        },
      },
    });

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "sleep_minutes_daily" } });

  const targetInput = screen.getByLabelText("Target value");
  fireEvent.change(targetInput, { target: { value: "420" } });

  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/goals",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"goalType":"sleep_minutes_daily"'),
      }),
    );
  });
});

test("API error shows a form-level error message", async () => {
  mockApiFetch
    .mockResolvedValueOnce(EMPTY_GOALS_RESPONSE) // GET on mount
    .mockRejectedValueOnce(new Error("Failed to create goal. Please try again."));

  renderGoalsPage();
  await waitFor(() => screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const targetInput = screen.getByLabelText("Target value");
  fireEvent.change(targetInput, { target: { value: "5000" } });

  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByRole("alert");
  });
});

// ── New goal prepended to list ────────────────────────────────────────────────

test("new goal appears at top of existing goals list after creation", async () => {
  const existingGoal = {
    id: "existing-1",
    goalType: "weight_target" as const,
    targetValue: 5,
    targetUnit: "lbs",
    cadence: "daily" as const,
    startDate: "2026-01-01",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const newGoal = {
    id: "new-1",
    goalType: "active_minutes_weekly" as const,
    targetValue: 150,
    targetUnit: "minutes",
    cadence: "weekly" as const,
    startDate: "2026-01-15",
    status: "active" as const,
    createdAt: "2026-01-15T00:00:00.000Z",
  };

  mockApiFetch
    .mockResolvedValueOnce({ data: { goals: [existingGoal] } }) // GET on mount
    .mockResolvedValueOnce({ data: { goal: newGoal } }); // POST

  renderGoalsPage();

  await waitFor(() => screen.getByText(/Weight target/));

  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "active_minutes_weekly" } });
  const targetInput = screen.getByLabelText("Target value");
  fireEvent.change(targetInput, { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByText(/Exercise active minutes weekly/);
  });

  const items = screen.getAllByRole("listitem");
  expect(items[0]?.textContent).toMatch(/Exercise active minutes weekly/);
  expect(items[1]?.textContent).toMatch(/Weight target/);
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "../App.js";
import { GoalsProgressPage } from "./GoalsProgressPage.js";
import { Layout } from "../components/Layout.js";

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

test("/goals route renders Goals & Progress page heading", () => {
  renderViaApp("/goals");
  screen.getByRole("heading", { name: /Goals & Progress/i, level: 1 });
});

// ── Sidebar navigation on goals page ─────────────────────────────────────────

test("goals page sidebar contains Dashboard link", () => {
  renderGoalsPage();
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("goals page sidebar Dashboard link points to /dashboard", () => {
  renderGoalsPage();
  const link = screen.getByRole("link", { name: "📊 Dashboard" });
  expect(link.getAttribute("href")).toBe("/dashboard");
});

test("goals page sidebar contains My Account link", () => {
  renderGoalsPage();
  screen.getByRole("link", { name: "👤 My Account" });
});

test("goals page sidebar contains Partners & Services link", () => {
  renderGoalsPage();
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("goals page sidebar shows user name", () => {
  renderGoalsPage();
  screen.getByText("Alex Johnson");
});

test("goals page sidebar shows user email", () => {
  renderGoalsPage();
  screen.getByText("alex@example.com");
});

test("goals page sidebar Log out link is present", () => {
  renderGoalsPage();
  screen.getByRole("link", { name: "Log out" });
});

// ── Create New Goal button ────────────────────────────────────────────────────

test("Goals & Progress page renders '+ Create New Goal' button", () => {
  renderGoalsPage();
  screen.getByRole("button", { name: "+ Create New Goal" });
});

// ── Goal creation form appears on button click ────────────────────────────────

test("clicking '+ Create New Goal' shows the goal creation form", () => {
  renderGoalsPage();
  expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("form", { name: "Create goal form" });
});

test("goal creation form has a goalType select", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Goal type");
});

test("goal creation form has a targetValue number input", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Target value");
});

test("goal creation form has a targetUnit text input", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Unit");
});

test("goal creation form has a startDate date input", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByLabelText("Start date (optional)");
});

test("goal creation form has a Save Goal button", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("button", { name: "Save Goal" });
});

test("goal creation form has a Cancel button", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("button", { name: "Cancel" });
});

// ── Cancel closes the form ────────────────────────────────────────────────────

test("clicking Cancel hides the goal creation form", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  screen.getByRole("form", { name: "Create goal form" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("form", { name: "Create goal form" })).toBeNull();
});

// ── Client-side validation ────────────────────────────────────────────────────

test("submitting the form without a targetValue shows an error", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));
  screen.getByRole("alert");
});

// ── goalType select includes all four supported types ─────────────────────────

test("goalType select has 'Daily steps' option", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Daily steps");
});

test("goalType select has 'Sleep (minutes daily)' option", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Sleep (minutes daily)");
});

test("goalType select has 'Weight target' option", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Weight target");
});

test("goalType select has 'Active minutes (weekly)' option", () => {
  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));
  const select = screen.getByLabelText("Goal type") as HTMLSelectElement;
  const options = Array.from(select.options).map((o) => o.text);
  expect(options).toContain("Active minutes (weekly)");
});

// ── Successful submission (mocked apiFetch) ───────────────────────────────────

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../api.js";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

test("successful goal creation adds the goal to the list", async () => {
  mockApiFetch.mockResolvedValueOnce({
    data: {
      id: "test-id-1",
      goal_type: "steps_daily",
      target_value: 10000,
      target_unit: "steps",
      cadence: "daily",
      start_date: "2026-01-15",
      status: "active",
    },
  });

  renderGoalsPage();
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
  mockApiFetch.mockResolvedValueOnce({
    data: {
      id: "test-id-2",
      goal_type: "sleep_minutes_daily",
      target_value: 420,
      target_unit: "minutes",
      cadence: "daily",
      start_date: "2026-01-15",
      status: "active",
    },
  });

  renderGoalsPage();
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
  mockApiFetch.mockRejectedValueOnce(new Error("Failed to create goal. Please try again."));

  renderGoalsPage();
  fireEvent.click(screen.getByRole("button", { name: "+ Create New Goal" }));

  const targetInput = screen.getByLabelText("Target value");
  fireEvent.change(targetInput, { target: { value: "5000" } });

  fireEvent.click(screen.getByRole("button", { name: "Save Goal" }));

  await waitFor(() => {
    screen.getByRole("alert");
  });
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { OnboardingProfilePage } from "./OnboardingProfilePage.js";

// ── apiFetch mock ────────────────────────────────────────────────────────────

const mockApiFetch = {
  implementation: (_path: string, _opts: RequestInit): Promise<unknown> =>
    Promise.resolve({}),
};

vi.mock("../api.js", () => ({
  apiFetch: (path: string, opts: RequestInit) =>
    mockApiFetch.implementation(path, opts),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingProfilePage />
    </MemoryRouter>,
  );
}

function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/onboarding/profile"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockApiFetch.implementation = () => Promise.resolve({});
});

// ── Route registration ────────────────────────────────────────────────────────

test("/onboarding/profile route renders the Welcome to WellnessHub! heading", () => {
  renderViaApp();
  screen.getByRole("heading", { name: "Welcome to WellnessHub!", level: 1 });
});

// ── Explanatory copy ─────────────────────────────────────────────────────────

test("renders the explanatory subheading copy", () => {
  renderPage();
  screen.getByText(
    "Let's set up your profile to personalize your wellness experience",
  );
});

// ── Form fields render ────────────────────────────────────────────────────────

test("renders Full Name required field", () => {
  renderPage();
  screen.getByLabelText("Full Name *");
});

test("renders Date of Birth optional field", () => {
  renderPage();
  screen.getByLabelText("Date of Birth (Optional)");
});

test("renders Gender optional select", () => {
  renderPage();
  screen.getByLabelText("Gender (Optional)");
});

test("renders all five wellness preference checkboxes with correct labels", () => {
  renderPage();

  screen.getByLabelText("Daily activity and step tracking");
  screen.getByLabelText("Sleep quality and duration");
  screen.getByLabelText("Weight and body composition");
  screen.getByLabelText("Heart rate and vital metrics");
  screen.getByLabelText("Goal setting and progress tracking");
});

test("renders the Next: Connect Devices submit button", () => {
  renderPage();
  screen.getByRole("button", { name: "Next: Connect Devices" });
});

test("renders the Skip for now link", () => {
  renderPage();
  screen.getByRole("link", { name: "Skip for now" });
});

// ── Required fullName validation ──────────────────────────────────────────────

test("submitting with empty Full Name shows an inline error and blocks fetch", async () => {
  const spy = vi.fn(() => Promise.resolve({}));
  mockApiFetch.implementation = spy;
  renderPage();

  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  screen.getByText("Full name is required.");
  expect(spy).not.toHaveBeenCalled();
});

test("inline fullName error disappears once Full Name is non-empty and form is resubmitted", async () => {
  mockApiFetch.implementation = () => Promise.resolve({});
  renderPage();

  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );
  screen.getByText("Full name is required.");

  fireEvent.change(screen.getByLabelText("Full Name *"), {
    target: { value: "Alice Smith" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  await waitFor(() =>
    expect(screen.queryByText("Full name is required.")).toBeNull(),
  );
});

// ── Optional fields do not block submission ───────────────────────────────────

test("submitting with only Full Name filled (no DOB, no gender) succeeds", async () => {
  mockApiFetch.implementation = () => Promise.resolve({});
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name *"), {
    target: { value: "Alice Smith" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/onboarding/devices"));
});

// ── PUT /api/v1/profile call ──────────────────────────────────────────────────

test("successful submission calls PUT /profile with fullName", async () => {
  const calls: { path: string; opts: RequestInit }[] = [];
  mockApiFetch.implementation = (path, opts) => {
    calls.push({ path, opts });
    return Promise.resolve({});
  };
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name *"), {
    target: { value: "Alice Smith" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.path).toBe("/profile");
  expect(calls[0]!.opts.method).toBe("PUT");
  const body = JSON.parse(calls[0]!.opts.body as string) as Record<string, unknown>;
  expect(body["fullName"]).toBe("Alice Smith");
});

// ── Navigation after success ──────────────────────────────────────────────────

test("successful submission navigates to /onboarding/devices", async () => {
  mockApiFetch.implementation = () => Promise.resolve({});
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name *"), {
    target: { value: "Alice Smith" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/onboarding/devices"));
});

// ── Skip for now ──────────────────────────────────────────────────────────────

test("Skip for now link points to /onboarding/devices without calling apiFetch", () => {
  const spy = vi.fn(() => Promise.resolve({}));
  mockApiFetch.implementation = spy;
  renderPage();

  const skipLink = screen.getByRole("link", { name: "Skip for now" });
  expect(skipLink).toHaveAttribute("href", "/onboarding/devices");
  expect(spy).not.toHaveBeenCalled();
});

// ── API error shows form-level error ─────────────────────────────────────────

test("when apiFetch rejects a form-level error message is shown", async () => {
  mockApiFetch.implementation = () =>
    Promise.reject(new Error("Network error"));
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name *"), {
    target: { value: "Alice Smith" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  await waitFor(() =>
    screen.getByText("Could not save your profile. Please try again."),
  );
});

// ── Gender and DOB included in request body ───────────────────────────────────

test("gender value is included in request body when selected", async () => {
  const calls: { path: string; opts: RequestInit }[] = [];
  mockApiFetch.implementation = (path, opts) => {
    calls.push({ path, opts });
    return Promise.resolve({});
  };
  renderPage();

  fireEvent.change(screen.getByLabelText("Full Name *"), {
    target: { value: "Alice Smith" },
  });
  fireEvent.change(screen.getByLabelText("Gender (Optional)"), {
    target: { value: "Female" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Next: Connect Devices" }).closest("form")!,
  );

  await waitFor(() => expect(calls).toHaveLength(1));
  const body = JSON.parse(calls[0]!.opts.body as string) as Record<string, unknown>;
  expect(body["gender"]).toBe("Female");
});

// ── Wellness preference checkboxes ────────────────────────────────────────────

test("Daily activity and step tracking checkbox is checked by default", () => {
  renderPage();
  const checkbox = screen.getByLabelText(
    "Daily activity and step tracking",
  ) as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
});

test("Sleep quality and duration checkbox is checked by default", () => {
  renderPage();
  const checkbox = screen.getByLabelText(
    "Sleep quality and duration",
  ) as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
});

test("Weight and body composition checkbox is unchecked by default", () => {
  renderPage();
  const checkbox = screen.getByLabelText(
    "Weight and body composition",
  ) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
});

// ── Dashboard mode section ────────────────────────────────────────────────────

test("dashboard mode section renders all three options", () => {
  renderPage();
  screen.getByText("Everyday Wellness");
  screen.getByText("Active Fitness");
  screen.getByText("Assisted / Chronic-Care-Aware");
});

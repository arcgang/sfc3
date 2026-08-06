import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyAccountPage } from "./pages/MyAccountPage.js";
import * as api from "./api.js";

vi.mock("./api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("./context/AuthContext.js", async () => {
  const actual = await vi.importActual<typeof import("./context/AuthContext.js")>(
    "./context/AuthContext.js",
  );
  return {
    ...actual,
    useAuth: () => ({ isAuthenticated: true, token: "tok", logout: vi.fn() }),
  };
});

const mockApiFetch = vi.mocked(api.apiFetch);

const PROFILE_FIXTURE = {
  fullName: "Alex Johnson",
  personaMode: "default",
  email: "alex@example.com",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MyAccountPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({
    data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
  });
});

// ── Three dashboard mode options are present ──────────────────────────────────

describe("MyAccount — dashboard mode options", () => {
  it("renders all three dashboard mode radio options", async () => {
    renderPage();
    await screen.findByRole("radio", { name: /Everyday Wellness/i });
    screen.getByRole("radio", { name: /Active Fitness/i });
    screen.getByRole("radio", { name: /Assisted \/ Chronic-Care-Aware/i });
  });

  it("renders the Everyday Wellness option with its description", async () => {
    renderPage();
    await screen.findByText("Everyday Wellness");
    screen.getByText(
      "Balanced view across all health domains. Best for general wellness tracking and daily health monitoring.",
    );
  });

  it("renders the Active Fitness option with its description", async () => {
    renderPage();
    await screen.findByText("Active Fitness");
    screen.getByText(
      "Emphasizes activity, workouts, recovery, and body composition. Ideal for fitness enthusiasts and athletes.",
    );
  });

  it("renders the Assisted / Chronic-Care-Aware option with its description", async () => {
    renderPage();
    await screen.findByText("Assisted / Chronic-Care-Aware");
    screen.getByText(
      "Larger emphasis on critical indicators, simplified readability, and clear alerts. Designed for easier monitoring.",
    );
  });
});

// ── Submitting an empty name shows a validation error ─────────────────────────

describe("MyAccount — edit profile validation", () => {
  it("shows a validation error when the full name is empty", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await screen.findByText("Full name must be between 2 and 120 characters.");
  });

  it("shows a validation error when the full name is a single character", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "X" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await screen.findByText("Full name must be between 2 and 120 characters.");
  });

  it("does not call the API when client-side validation fails", async () => {
    mockApiFetch.mockResolvedValue({
      data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
    });
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await screen.findByText("Full name must be between 2 and 120 characters.");
    // Only the initial GET /profile call; no PUT should have been made
    const putCalls = mockApiFetch.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCalls).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyAccountPage } from "./MyAccountPage.js";
import * as api from "../api.js";

vi.mock("../api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../context/AuthContext.js", async () => {
  const actual = await vi.importActual<typeof import("../context/AuthContext.js")>(
    "../context/AuthContext.js",
  );
  return {
    ...actual,
    useAuth: () => ({ isAuthenticated: true, token: "tok", logout: vi.fn() }),
  };
});

const mockApiFetch = vi.mocked(api.apiFetch);

const PROFILE_FIXTURE = {
  id: "profile-001",
  userId: "user-001",
  fullName: "Alex Johnson",
  dateOfBirth: null,
  gender: null,
  wellnessPreferences: ["activity", "sleep"],
  personaMode: "default",
  privacy: {
    policyAccepted: false,
    dataExportRequested: false,
    dataDeletionRequested: false,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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

// ── Loading state ──────────────────────────────────────────────────────────────

describe("MyAccountPage — loading state", () => {
  it("shows a loading message before data arrives", () => {
    mockApiFetch.mockReturnValue(new Promise(() => undefined));
    renderPage();
    screen.getByText("Loading your account…");
  });
});

// ── Error state ────────────────────────────────────────────────────────────────

describe("MyAccountPage — error state", () => {
  it("shows an error message when the fetch fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network error"));
    renderPage();
    await screen.findByText("Could not load your profile. Please try again.");
  });

  it("renders a Retry button when the fetch fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network error"));
    renderPage();
    await screen.findByRole("button", { name: "Retry" });
  });
});

// ── Loaded state — page structure ─────────────────────────────────────────────

describe("MyAccountPage — loaded state", () => {
  it("renders the My Account heading", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "My Account", level: 1 });
  });

  it("renders the Profile section heading", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Profile", level: 2 });
  });

  it("renders the Dashboard Mode section heading", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Dashboard Mode", level: 2 });
  });

  it("renders the Wellness Preferences section heading", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Wellness Preferences", level: 2 });
  });

  it("renders the Privacy & Data Settings section heading", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Privacy & Data Settings", level: 2 });
  });

  it("renders the Security section heading", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Security", level: 2 });
  });
});

// ── Profile display ────────────────────────────────────────────────────────────

describe("MyAccountPage — profile display", () => {
  it("displays the user's full name in the profile section", async () => {
    renderPage();
    const section = await screen.findByRole("region", { name: "Profile" });
    expect(within(section).getAllByText("Alex Johnson").length).toBeGreaterThan(0);
  });

  it("displays the user's email address with verified badge", async () => {
    renderPage();
    await screen.findByText("(verified)");
    const emails = await screen.findAllByText("alex@example.com");
    expect(emails.length).toBeGreaterThan(0);
  });

  it("renders the Edit Profile button", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Edit Profile" });
  });
});

// ── Edit profile inline form ───────────────────────────────────────────────────

describe("MyAccountPage — edit profile form", () => {
  it("shows the edit form when Edit Profile is clicked", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    screen.getByRole("form", { name: "Edit profile form" });
  });

  it("pre-fills the full name input with the current name", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name") as HTMLInputElement;
    expect(input.value).toBe("Alex Johnson");
  });

  it("shows a validation error when name is fewer than 2 characters", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "A" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await screen.findByText("Full name must be between 2 and 120 characters.");
  });

  it("shows a validation error when name is empty", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await screen.findByText("Full name must be between 2 and 120 characters.");
  });

  it("closes the edit form when Cancel is clicked", async () => {
    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    act(() => { fireEvent.click(cancelBtn); });
    expect(screen.queryByRole("form", { name: "Edit profile form" })).toBeNull();
  });

  it("calls PUT /profile with the new name on save", async () => {
    const updatedProfile = { ...PROFILE_FIXTURE, fullName: "Alex Chen" };
    mockApiFetch
      .mockResolvedValueOnce({
        data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
      })
      .mockResolvedValueOnce({ data: { profile: updatedProfile } });

    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "Alex Chen" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/profile",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("reflects the updated name after a successful save", async () => {
    const updatedProfile = { ...PROFILE_FIXTURE, fullName: "Alex Chen" };
    mockApiFetch
      .mockResolvedValueOnce({
        data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
      })
      .mockResolvedValueOnce({ data: { profile: updatedProfile } });

    renderPage();
    const editBtn = await screen.findByRole("button", { name: "Edit Profile" });
    act(() => { fireEvent.click(editBtn); });
    const input = screen.getByLabelText("Full Name");
    fireEvent.change(input, { target: { value: "Alex Chen" } });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });

    const names = await screen.findAllByText("Alex Chen");
    expect(names.length).toBeGreaterThan(0);
    expect(screen.queryByRole("form", { name: "Edit profile form" })).toBeNull();
  });
});

// ── Dashboard mode selector ────────────────────────────────────────────────────

describe("MyAccountPage — dashboard mode selector", () => {
  it("renders the three dashboard mode options", async () => {
    renderPage();
    await screen.findByRole("radio", { name: /Everyday Wellness/i });
    screen.getByRole("radio", { name: /Active Fitness/i });
    screen.getByRole("radio", { name: /Assisted \/ Chronic-Care-Aware/i });
  });

  it("has Everyday Wellness selected by default when personaMode is 'default'", async () => {
    renderPage();
    const radio = (await screen.findByRole("radio", {
      name: /Everyday Wellness/i,
    })) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("renders a Save Dashboard Mode button", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Save Dashboard Mode" });
  });

  it("calls PUT /profile with the selected personaMode on save", async () => {
    const updatedProfile = { ...PROFILE_FIXTURE, personaMode: "fitness" };
    mockApiFetch
      .mockResolvedValueOnce({
        data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
      })
      .mockResolvedValueOnce({ data: { profile: updatedProfile } });

    renderPage();
    await screen.findByRole("radio", { name: /Active Fitness/i });
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: /Active Fitness/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save Dashboard Mode" }));
    });

    await waitFor(() => {
      const putCall = mockApiFetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string) as {
        personaMode: string;
      };
      expect(body.personaMode).toBe("fitness");
    });
  });

  it("has Active Fitness selected when personaMode is 'fitness'", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: {
        email: "alex@example.com",
        profile: { ...PROFILE_FIXTURE, personaMode: "fitness" },
      },
    });
    renderPage();
    const radio = (await screen.findByRole("radio", {
      name: /Active Fitness/i,
    })) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("has Assisted / Chronic-Care-Aware selected when personaMode is 'chronic_care_aware'", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: {
        email: "alex@example.com",
        profile: { ...PROFILE_FIXTURE, personaMode: "chronic_care_aware" },
      },
    });
    renderPage();
    const radio = (await screen.findByRole("radio", {
      name: /Assisted \/ Chronic-Care-Aware/i,
    })) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("shows an error when saving mode fails", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
      })
      .mockRejectedValueOnce(new Error("save failed"));

    renderPage();
    await screen.findByRole("radio", { name: /Active Fitness/i });
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: /Active Fitness/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save Dashboard Mode" }));
    });

    await screen.findByText("Could not save your Dashboard Mode. Please try again.");
  });
});

// ── Privacy & Security ─────────────────────────────────────────────────────────

describe("MyAccountPage — privacy and security", () => {
  it("renders the Export My Data button", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Export My Data" });
  });

  it("renders the Delete My Account button", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Delete My Account" });
  });

  it("renders the Change Password link", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Change Password" });
  });

  it("renders the View Sessions link", async () => {
    renderPage();
    await screen.findByRole("link", { name: "View Sessions" });
  });
});

// ── Null profile (no onboarding yet) ─────────────────────────────────────────

describe("MyAccountPage — null profile (not yet onboarded)", () => {
  it("still renders the page without errors when profile is null", async () => {
    mockApiFetch.mockResolvedValue({
      data: { email: "new@example.com", profile: null },
    });
    renderPage();
    await screen.findByRole("heading", { name: "My Account", level: 1 });
  });
});

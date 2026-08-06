import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyAccountPage } from "./MyAccountPage.js";
import * as api from "../api.js";

vi.mock("../api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, apiFetch: vi.fn() };
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

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { MyAccountPage } from "./MyAccountPage.js";

// ── apiFetch mock ────────────────────────────────────────────────────────────

type ApiFetchImpl = (path: string, opts?: RequestInit) => Promise<unknown>;

const mockApiFetch = {
  implementation: ((_path: string, _opts?: RequestInit): Promise<unknown> =>
    Promise.resolve({
      data: {
        profile: {
          fullName: "Alex Johnson",
          personaMode: "default",
        },
      },
    })) as ApiFetchImpl,
};

vi.mock("../api.js", () => ({
  apiFetch: (path: string, opts?: RequestInit) =>
    mockApiFetch.implementation(path, opts),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock("../context/AuthContext.js", async () => {
  const actual = await vi.importActual<typeof import("../context/AuthContext.js")>(
    "../context/AuthContext.js",
  );
  return {
    ...actual,
    useAuth: () => ({ isAuthenticated: true, token: "tok", logout: vi.fn() }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MyAccountPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
    await screen.findByText("Failed to load profile. Please try again.");
  });

  it("renders a Retry button when the fetch fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network error"));
    renderPage();
    await screen.findByRole("button", { name: "Retry" });
  });
});

// ── Loaded state — page structure ─────────────────────────────────────────────

describe("MyAccountPage — loaded state", () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({
      data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
    });
  });

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
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({
      data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
    });
  });

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
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({
      data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
    });
  });

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
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({
      data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
    });
  });

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
});

// ── Privacy & Security ─────────────────────────────────────────────────────────

describe("MyAccountPage — privacy and security", () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({
      data: { email: "alex@example.com", profile: PROFILE_FIXTURE },
    });
  });

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
function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/my-account"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApiFetch.implementation = () =>
    Promise.resolve({
      data: {
        profile: {
          fullName: "Alex Johnson",
          personaMode: "default",
        },
      },
    });
});

// ── Route registration ────────────────────────────────────────────────────────

test("/my-account route renders the My Account heading", async () => {
  renderViaApp();
  await waitFor(() => screen.getByRole("heading", { name: "My Account", level: 1 }));
});

// ── Page heading ──────────────────────────────────────────────────────────────

test("renders My Account h1", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("heading", { name: "My Account", level: 1 }));
});

// ── Section headings ──────────────────────────────────────────────────────────

test("renders Profile section heading", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("heading", { name: "Profile", level: 2 }));
});

test("renders Dashboard Mode section heading", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("heading", { name: "Dashboard Mode", level: 2 }));
});

test("renders Wellness Preferences section heading", async () => {
  renderPage();
  await waitFor(() =>
    screen.getByRole("heading", { name: "Wellness Preferences", level: 2 }),
  );
});

test("renders Privacy & Data Settings section heading", async () => {
  renderPage();
  await waitFor(() =>
    screen.getByRole("heading", { name: "Privacy & Data Settings", level: 2 }),
  );
});

test("renders Security section heading", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("heading", { name: "Security", level: 2 }));
});

// ── Dashboard mode options ────────────────────────────────────────────────────

test("renders Everyday Wellness option", async () => {
  renderPage();
  await waitFor(() => screen.getByText("Everyday Wellness"));
});

test("renders Active Fitness option", async () => {
  renderPage();
  await waitFor(() => screen.getByText("Active Fitness"));
});

test("renders Assisted / Chronic-Care-Aware option", async () => {
  renderPage();
  await waitFor(() => screen.getByText("Assisted / Chronic-Care-Aware"));
});

test("Everyday Wellness description matches design spec", async () => {
  renderPage();
  await waitFor(() =>
    screen.getByText(
      "Balanced view across all health domains. Best for general wellness tracking and daily health monitoring.",
    ),
  );
});

test("Active Fitness description matches design spec", async () => {
  renderPage();
  await waitFor(() =>
    screen.getByText(
      "Emphasizes activity, workouts, recovery, and body composition. Ideal for fitness enthusiasts and athletes.",
    ),
  );
});

test("Assisted / Chronic-Care-Aware description matches design spec", async () => {
  renderPage();
  await waitFor(() =>
    screen.getByText(
      "Larger emphasis on critical indicators, simplified readability, and clear alerts. Designed for easier monitoring.",
    ),
  );
});

// ── Mode preselected from profile ────────────────────────────────────────────

test("radio for loaded personaMode=default is checked", async () => {
  mockApiFetch.implementation = () =>
    Promise.resolve({
      data: { profile: { fullName: "Alex Johnson", personaMode: "default" } },
    });
  renderPage();

  await waitFor(() => {
    const radio = screen.getByRole("radio", { name: /Everyday Wellness/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });
});

test("radio for loaded personaMode=fitness is checked", async () => {
  mockApiFetch.implementation = () =>
    Promise.resolve({
      data: { profile: { fullName: "Alex Johnson", personaMode: "fitness" } },
    });
  renderPage();

  await waitFor(() => {
    const radio = screen.getByRole("radio", { name: /Active Fitness/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });
});

test("radio for loaded personaMode=chronic_care_aware is checked", async () => {
  mockApiFetch.implementation = () =>
    Promise.resolve({
      data: { profile: { fullName: "Alex Johnson", personaMode: "chronic_care_aware" } },
    });
  renderPage();

  await waitFor(() => {
    const radio = screen.getByRole("radio", { name: /Assisted \/ Chronic-Care-Aware/i }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });
});

// ── Saving mode calls PUT /profile ────────────────────────────────────────────

test("selecting a mode calls PUT /profile with the new personaMode", async () => {
  const calls: { path: string; opts: RequestInit }[] = [];
  mockApiFetch.implementation = (path: string, opts?: RequestInit) => {
    if (opts?.method === "PUT") {
      calls.push({ path, opts });
    }
    return Promise.resolve({
      data: { profile: { fullName: "Alex Johnson", personaMode: "default" } },
    });
  };
  renderPage();

  // Wait for the loaded state (radios present)
  await waitFor(() => screen.getByRole("radio", { name: /Active Fitness/i }));
  fireEvent.click(screen.getByRole("radio", { name: /Active Fitness/i }));

  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.path).toBe("/profile");
  expect(calls[0]!.opts.method).toBe("PUT");
  const body = JSON.parse(calls[0]!.opts.body as string) as Record<string, unknown>;
  expect(body["personaMode"]).toBe("fitness");
});

// ── Actions ───────────────────────────────────────────────────────────────────

test("renders Edit Profile button", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("button", { name: "Edit Profile" }));
});

test("renders Export My Data button", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("button", { name: "Export My Data" }));
});

test("renders Delete My Account button", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("button", { name: "Delete My Account" }));
});

test("renders Change Password link", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("link", { name: "Change Password" }));
});

test("renders View Sessions link", async () => {
  renderPage();
  await waitFor(() => screen.getByRole("link", { name: "View Sessions" }));
});

// ── Error state ───────────────────────────────────────────────────────────────

test("shows error message when profile fetch fails", async () => {
  mockApiFetch.implementation = () => Promise.reject(new Error("Network error"));
  renderPage();
  await waitFor(() =>
    screen.getByText("Could not load your profile. Please try again."),
  );
});

test("error state includes a Retry button", async () => {
  mockApiFetch.implementation = () => Promise.reject(new Error("Network error"));
  renderPage();
  await waitFor(() => screen.getByRole("button", { name: "Retry" }));
});

// ── Loading state ─────────────────────────────────────────────────────────────

test("shows loading text before profile resolves", () => {
  mockApiFetch.implementation = () => new Promise(() => {/* never resolves */});
  renderPage();
  screen.getByText("Loading your account…");
});

// ── PUT error shown to user ───────────────────────────────────────────────────

test("shows error message when saving mode fails", async () => {
  const calls: string[] = [];
  mockApiFetch.implementation = (path: string, opts?: RequestInit) => {
    if (opts?.method === "PUT") {
      calls.push(path);
      return Promise.reject(new Error("save failed"));
    }
    return Promise.resolve({
      data: { profile: { fullName: "Alex Johnson", personaMode: "default" } },
    });
  };
  renderPage();

  await waitFor(() => screen.getByRole("radio", { name: /Active Fitness/i }));
  fireEvent.click(screen.getByRole("radio", { name: /Active Fitness/i }));

  await waitFor(() =>
    screen.getByText("Could not save your Dashboard Mode. Please try again."),
  );
});

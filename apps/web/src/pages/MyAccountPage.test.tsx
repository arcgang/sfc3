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

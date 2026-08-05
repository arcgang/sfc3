<<<<<<< HEAD
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "../App.js";
import { DevicePairingPage } from "./DevicePairingPage.js";

function renderDevicePairingPage() {
=======
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { DevicePairingPage } from "./DevicePairingPage.js";

// ── apiFetch mock ─────────────────────────────────────────────────────────────
const mockApiFetch = {
  implementation: (_path: string, _opts: RequestInit): Promise<unknown> =>
    Promise.resolve({}),
};

vi.mock("../api.js", () => ({
  apiFetch: (path: string, opts: RequestInit) =>
    mockApiFetch.implementation(path, opts),
}));

function successResponse() {
  return Promise.resolve({
    data: { device: { status: "connected", lastSyncAt: null } },
  });
}

function failureResponse() {
  return Promise.reject(new Error("Internal Server Error"));
}

function renderPage() {
>>>>>>> origin/main
  return render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
}

<<<<<<< HEAD
function renderViaApp(path = "/devices/pair") {
  return render(
    <MemoryRouter initialEntries={[path]}>
=======
function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
>>>>>>> origin/main
      <App />
    </MemoryRouter>,
  );
}

<<<<<<< HEAD
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
=======
// Reset mock before each test
beforeEach(() => {
  mockApiFetch.implementation = (_path, _opts) => successResponse();
>>>>>>> origin/main
});

// ── Route registration ────────────────────────────────────────────────────────

test("/devices/pair route renders the Connect Your Devices heading", () => {
<<<<<<< HEAD
  renderViaApp("/devices/pair");
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

test("/onboarding/devices redirects to /devices/pair", () => {
  renderViaApp("/onboarding/devices");
=======
  renderViaApp();
>>>>>>> origin/main
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

// ── Device type tiles ─────────────────────────────────────────────────────────

<<<<<<< HEAD
test("pairing screen renders 'Connect Smartwatch' button in the smartwatch tile", () => {
  renderDevicePairingPage();
  screen.getByRole("button", { name: "Connect Smartwatch" });
});

test("pairing screen renders 'Connect Smart Scale' button in the smart scale tile", () => {
  renderDevicePairingPage();
  screen.getByRole("button", { name: "Connect Smart Scale" });
});

test("pairing screen renders 'Smart Scale' tile with correct heading", () => {
  renderDevicePairingPage();
  screen.getByRole("heading", { name: "Smart Scale", level: 3 });
});

test("pairing screen renders 'Smartwatch' tile with correct heading", () => {
  renderDevicePairingPage();
  screen.getByRole("heading", { name: "Smartwatch", level: 3 });
});

// ── Provider grid ─────────────────────────────────────────────────────────────

test("pairing screen renders Withings provider in the provider grid", () => {
  renderDevicePairingPage();
  screen.getByRole("heading", { name: "Select Your Device Provider", level: 2 });
  screen.getByRole("button", { name: "Connect Withings" });
});

test("pairing screen renders Fitbit provider Connect button", () => {
  renderDevicePairingPage();
  screen.getByRole("button", { name: "Connect Fitbit" });
});

test("pairing screen renders Apple Watch provider Connect button", () => {
  renderDevicePairingPage();
  screen.getByRole("button", { name: "Connect Apple Watch" });
});

test("pairing screen renders Garmin provider Connect button", () => {
  renderDevicePairingPage();
  screen.getByRole("button", { name: "Connect Garmin" });
});

// ── Connection steps ──────────────────────────────────────────────────────────

test("pairing screen renders 'Connection Steps' heading", () => {
  renderDevicePairingPage();
  screen.getByRole("heading", { name: "Connection Steps", level: 3 });
});

// ── Navigation links ──────────────────────────────────────────────────────────

test("pairing screen renders 'Skip for now' link", () => {
  renderDevicePairingPage();
  screen.getByRole("link", { name: "Skip for now" });
});

test("pairing screen renders 'Continue to Dashboard' button", () => {
  renderDevicePairingPage();
  screen.getByRole("button", { name: "Continue to Dashboard" });
});

// ── Success state after pairing ───────────────────────────────────────────────

test("clicking 'Connect Withings' shows 'Device connected successfully!' on a 200 response", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      meta: { correlationId: "abc", timestamp: "2026-01-01T00:00:00Z" },
      data: {
        device: {
          id: "1",
          deviceName: "Withings Body+",
          deviceType: "smart_scale",
          status: "connected",
          lastSyncAt: null,
          batteryLevel: null,
          connectedSince: "2026-01-15T00:00:00Z",
        },
      },
    }),
  });
  vi.stubGlobal("fetch", mockFetch);

  renderDevicePairingPage();
  fireEvent.click(screen.getByRole("button", { name: "Connect Withings" }));
=======
test("'Smartwatch' device type tile heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Smartwatch", level: 3 });
});

test("'Smart Scale' device type tile heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Smart Scale", level: 3 });
});

test("'Connect Smartwatch' button is rendered in the Smartwatch tile", () => {
  renderPage();
  screen.getByRole("button", { name: "Connect Smartwatch" });
});

test("'Connect Smart Scale' button is rendered in the Smart Scale tile", () => {
  renderPage();
  screen.getByRole("button", { name: "Connect Smart Scale" });
});

// ── Provider tiles ────────────────────────────────────────────────────────────

test("Fitbit provider tile heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Fitbit", level: 3 });
});

test("Apple Watch provider tile heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Apple Watch", level: 3 });
});

test("Garmin provider tile heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Garmin", level: 3 });
});

test("Withings provider tile heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Withings", level: 3 });
});

test("each of the four provider tiles has a 'Connect' button (4 total)", () => {
  renderPage();
  const connectBtns = screen.getAllByRole("button", { name: "Connect" });
  expect(connectBtns.length).toBe(4);
});

// ── Connect flow — success ────────────────────────────────────────────────────

test("clicking Fitbit Connect and receiving a success response shows 'Device connected successfully!'", async () => {
  mockApiFetch.implementation = successResponse;
  renderPage();

  const [fitbitConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(fitbitConnectBtn!);
  });
>>>>>>> origin/main

  await waitFor(() => {
    screen.getByText("✓ Device connected successfully!");
  });
});

<<<<<<< HEAD
// ── Failure state after pairing ───────────────────────────────────────────────

test("clicking 'Connect Withings' shows 'Connection failed. Please try again.' on a 500 response", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });
  vi.stubGlobal("fetch", mockFetch);

  renderDevicePairingPage();
  fireEvent.click(screen.getByRole("button", { name: "Connect Withings" }));
=======
test("clicking Apple Watch Connect and receiving a success response shows the success message", async () => {
  mockApiFetch.implementation = successResponse;
  renderPage();

  const connectBtns = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(connectBtns[1]!);
  });

  await waitFor(() => {
    screen.getByText("✓ Device connected successfully!");
  });
});

// ── Connect flow — failure ────────────────────────────────────────────────────

test("clicking Fitbit Connect and receiving a non-2xx response shows 'Connection failed. Please try again.'", async () => {
  mockApiFetch.implementation = failureResponse;
  renderPage();

  const [fitbitConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(fitbitConnectBtn!);
  });
>>>>>>> origin/main

  await waitFor(() => {
    screen.getByText("✗ Connection failed. Please try again.");
  });
});

<<<<<<< HEAD
test("failure message is shown when the API call rejects entirely", async () => {
  const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
  vi.stubGlobal("fetch", mockFetch);

  renderDevicePairingPage();
  fireEvent.click(screen.getByRole("button", { name: "Connect Withings" }));
=======
test("failure message element has role='alert'", async () => {
  mockApiFetch.implementation = failureResponse;
  renderPage();

  const [fitbitConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(fitbitConnectBtn!);
  });

  await waitFor(() => {
    screen.getByRole("alert");
  });
});

test("success message is not shown when the API call fails", async () => {
  mockApiFetch.implementation = failureResponse;
  renderPage();

  const [fitbitConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(fitbitConnectBtn!);
  });
>>>>>>> origin/main

  await waitFor(() => {
    screen.getByText("✗ Connection failed. Please try again.");
  });
<<<<<<< HEAD
});

// ── No success/failure message initially ──────────────────────────────────────

test("no success or failure message is shown before any connect action", () => {
  renderDevicePairingPage();
  expect(screen.queryByText("✓ Device connected successfully!")).toBeNull();
  expect(screen.queryByText("✗ Connection failed. Please try again.")).toBeNull();
=======
  expect(screen.queryByText("✓ Device connected successfully!")).toBeNull();
});

// ── API call payload ──────────────────────────────────────────────────────────

test("clicking Garmin Connect calls PUT /devices/connections with action='connect', provider='Garmin', deviceType='smartwatch'", async () => {
  const calls: Array<[string, RequestInit]> = [];
  mockApiFetch.implementation = (path, opts) => {
    calls.push([path, opts]);
    return successResponse();
  };
  renderPage();

  const connectBtns = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(connectBtns[2]!); // Garmin is index 2
  });

  await waitFor(() => {
    screen.getByText("✓ Device connected successfully!");
  });

  expect(calls.length).toBe(1);
  expect(calls[0]![0]).toBe("/devices/connections");
  const body = JSON.parse(calls[0]![1].body as string) as Record<string, unknown>;
  expect(body["action"]).toBe("connect");
  expect(body["provider"]).toBe("Garmin");
  expect(body["deviceType"]).toBe("smartwatch");
});

// ── Skip for now link ─────────────────────────────────────────────────────────

test("'Skip for now' link is rendered on the pairing screen", () => {
  renderPage();
  screen.getByRole("link", { name: "Skip for now" });
});

test("'Skip for now' link points to /", () => {
  renderPage();
  const link = screen.getByRole("link", { name: "Skip for now" });
  expect(link.getAttribute("href")).toBe("/");
});

test("'Skip for now' link does not call the API when clicked", async () => {
  const calls: string[] = [];
  mockApiFetch.implementation = (path) => {
    calls.push(path);
    return successResponse();
  };
  renderPage();

  const skipLink = screen.getByRole("link", { name: "Skip for now" });
  await act(async () => {
    fireEvent.click(skipLink);
  });

  expect(calls.length).toBe(0);
});

// ── Continue to Dashboard link ────────────────────────────────────────────────

test("'Continue to Dashboard' link is rendered on the pairing screen", () => {
  renderPage();
  screen.getByRole("link", { name: "Continue to Dashboard" });
});

// ── Connection Steps ──────────────────────────────────────────────────────────

test("'Connection Steps' section heading is rendered", () => {
  renderPage();
  screen.getByRole("heading", { name: "Connection Steps", level: 2 });
});

test("first connection step about clicking Authorize is rendered", () => {
  renderPage();
  screen.getByText(/Click "Authorize" to grant WellnessHub access/);
});

test("connection step about logging in to provider account is rendered", () => {
  renderPage();
  screen.getByText(/Log in to your device provider account when prompted/);
>>>>>>> origin/main
});

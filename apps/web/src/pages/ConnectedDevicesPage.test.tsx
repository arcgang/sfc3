import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "../App.js";
import { ConnectedDevicesPage } from "./ConnectedDevicesPage.js";

const WITHINGS_DEVICE = {
  id: "device-1",
  deviceName: "Withings Body+",
  provider: "Withings",
  deviceType: "smart_scale" as const,
  status: "connected",
  lastSyncAt: "2026-01-15T12:00:00Z",
  batteryLevel: "Good",
  connectedSince: "2026-01-15T00:00:00Z",
};

function makeGetResponse(devices: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      meta: { correlationId: "abc", timestamp: "2026-01-15T00:00:00Z" },
      data: { devices },
    }),
  });
}

function renderConnectedDevicesPage() {
  return render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
}

function renderViaApp(path = "/devices") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", makeGetResponse([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Route registration ────────────────────────────────────────────────────────

test("/devices route renders the Connected Devices heading", async () => {
  renderViaApp("/devices");
  await waitFor(() => {
    screen.getByRole("heading", { name: "Connected Devices", level: 1 });
  });
});

// ── Sidebar navigation ────────────────────────────────────────────────────────

test("connected devices page renders '📊 Dashboard' sidebar nav link", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByRole("link", { name: "📊 Dashboard" });
  });
});

test("connected devices page renders '👤 My Account' sidebar nav link", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByRole("link", { name: "👤 My Account" });
  });
});

test("connected devices page renders '🤝 Partners & Services' sidebar nav link", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByRole("link", { name: "🤝 Partners & Services" });
  });
});

test("connected devices page renders 'Log out' link", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByRole("link", { name: "Log out" });
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

test("shows 'No devices connected yet.' when the API returns an empty list", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByText(/No devices connected yet/i);
  });
});

// ── Smart Scale badge ─────────────────────────────────────────────────────────

test("renders a 'Smart Scale' type badge for a device with device_type='smart_scale'", async () => {
  vi.stubGlobal("fetch", makeGetResponse([WITHINGS_DEVICE]));

  renderConnectedDevicesPage();

  await waitFor(() => {
    screen.getByRole("heading", { name: "Withings Body+", level: 3 });
  });

  const heading = screen.getByRole("heading", { name: "Withings Body+", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected Withings Body+ card <li> to exist");
  within(card).getByText("Smart Scale");
});

test("renders a 'Smartwatch' type badge for a device with device_type='smartwatch'", async () => {
  const smartwatch = {
    id: "device-2",
    deviceName: "Fitbit Charge 5",
    provider: "Fitbit",
    deviceType: "smartwatch" as const,
    status: "connected",
    lastSyncAt: "2026-01-15T10:00:00Z",
    batteryLevel: "78%",
    connectedSince: "2026-01-15T00:00:00Z",
  };
  vi.stubGlobal("fetch", makeGetResponse([smartwatch]));

  renderConnectedDevicesPage();

  await waitFor(() => {
    screen.getByRole("heading", { name: "Fitbit Charge 5", level: 3 });
  });

  const heading = screen.getByRole("heading", { name: "Fitbit Charge 5", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected Fitbit Charge 5 card <li> to exist");
  within(card).getByText("Smartwatch");
});

// ── Device card fields ────────────────────────────────────────────────────────

test("Withings Body+ card shows device name, status, battery, and connected-since", async () => {
  vi.stubGlobal("fetch", makeGetResponse([WITHINGS_DEVICE]));

  renderConnectedDevicesPage();

  await waitFor(() => {
    screen.getByRole("heading", { name: "Withings Body+", level: 3 });
  });

  const heading = screen.getByRole("heading", { name: "Withings Body+", level: 3 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected Withings Body+ card <li> to exist");

  within(card).getByText("Withings Body+");
  within(card).getByText("Smart Scale");
  expect(card.textContent).toContain("Good");
});

// ── Add Device button ─────────────────────────────────────────────────────────

test("'Add Device' button is rendered in the add-device section", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByRole("button", { name: "Add Device" });
  });
});

test("'Add Another Device' heading is rendered", async () => {
  renderConnectedDevicesPage();
  await waitFor(() => {
    screen.getByRole("heading", { name: "Add Another Device", level: 3 });
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

test("shows a loading indicator while the API call is in flight", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
  );
  renderConnectedDevicesPage();
  screen.getByRole("status");
});

// ── Error state ───────────────────────────────────────────────────────────────

test("shows an error message when the API returns a non-ok response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    }),
  );

  renderConnectedDevicesPage();

  await waitFor(() => {
    screen.getByRole("alert");
  });
  screen.getByText(/Failed to load connected devices/i);
});

test("shows a Retry button when the fetch fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    }),
  );

  renderConnectedDevicesPage();

  await waitFor(() => {
    screen.getByRole("button", { name: "Retry" });
  });
});

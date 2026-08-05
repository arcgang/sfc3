import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "../App.js";
import { ConnectedDevicesPage } from "./ConnectedDevicesPage.js";

vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { apiFetch } from "../api.js";
const mockApiFetch = vi.mocked(apiFetch);

const SMARTWATCH_DEVICE = {
  id: "device-001",
  deviceName: "Fitbit Charge 5",
  provider: "Fitbit",
  deviceType: "smartwatch" as const,
  status: "connected",
  lastSyncAt: "2026-01-17T10:30:00.000Z",
  batteryLevel: "78%",
  connectedSince: "2026-01-15T00:00:00.000Z",
};

const SCALE_DEVICE = {
  id: "device-002",
  deviceName: "Withings Body+",
  provider: "Withings",
  deviceType: "smart_scale" as const,
  status: "pending",
  lastSyncAt: "2026-01-16T18:00:00.000Z",
  batteryLevel: "Good",
  connectedSince: "2026-01-15T00:00:00.000Z",
};

type DeviceFixture = {
  id: string;
  deviceName: string;
  provider: string;
  deviceType: "smartwatch" | "smart_scale";
  status: string;
  lastSyncAt: string | null;
  batteryLevel: string | null;
  connectedSince: string;
};

function makeResponse(devices: DeviceFixture[]) {
  return {
    meta: { correlationId: "test-cid", timestamp: new Date().toISOString() },
    data: { devices },
  };
}

function renderPage() {
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
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Route registration ────────────────────────────────────────────────────────

test("/devices route renders the Connected Devices page heading", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderViaApp("/devices");
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
});

// ── Page heading ──────────────────────────────────────────────────────────────

test("renders the 'Connected Devices' h1 heading", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
});

// ── Loading state ─────────────────────────────────────────────────────────────

test("shows a loading status message while the request is in-flight", async () => {
  let resolve!: (v: ReturnType<typeof makeResponse>) => void;
  mockApiFetch.mockReturnValueOnce(
    new Promise<ReturnType<typeof makeResponse>>((r) => { resolve = r; }),
  );
  renderPage();
  screen.getByRole("status");
  resolve(makeResponse([]));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
});

// ── Populated state — smartwatch card ────────────────────────────────────────

test("renders the device name 'Fitbit Charge 5' when the API returns a smartwatch", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
});

test("renders the 'Smartwatch' type badge for a smartwatch device", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("Smartwatch")).toBeTruthy();
});

test("renders '✓ Synced' status for a connected smartwatch", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("✓ Synced")).toBeTruthy();
});

test("renders the last-sync time formatted from lastSyncAt on the smartwatch card", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  // lastSyncAt: 2026-01-17T10:30:00.000Z — formatted date must contain "Jan" and "2026"
  const ddEl = within(card).getAllByRole("term").find((el) => el.textContent === "Last Sync");
  expect(ddEl).toBeTruthy();
  const cardText = card.textContent ?? "";
  expect(cardText).toContain("Jan");
  expect(cardText).toContain("2026");
});

test("renders the battery level '78%' on the smartwatch card", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("78%")).toBeTruthy();
});

test("renders the connected-since date formatted from connectedSince on the smartwatch card", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  // connectedSince: 2026-01-15T00:00:00.000Z — formatted date must contain "Jan" and "15"
  const cardText = card.textContent ?? "";
  expect(cardText).toContain("Jan");
  expect(cardText).toContain("15");
});

test("renders the smartwatch icon '⌚' on the smartwatch card", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(card.textContent).toContain("⌚");
});

// ── Populated state — action buttons ─────────────────────────────────────────

test("renders 'Sync Now' button for a connected device", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Sync Now" })).toBeTruthy();
});

test("renders 'Disconnect' button on every device card", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

// ── Multiple devices ──────────────────────────────────────────────────────────

test("renders two device cards when the API returns two devices", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeResponse([SMARTWATCH_DEVICE, SCALE_DEVICE]),
  );
  renderPage();
  await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
  screen.getByRole("heading", { name: "Withings Body+", level: 2 });
});

// ── Empty state ───────────────────────────────────────────────────────────────

test("shows the 'Add Another Device' section when the devices array is empty", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Add Another Device", level: 2 });
});

test("shows the 'Add Another Device' section even when devices are present", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([SMARTWATCH_DEVICE]));
  renderPage();
  await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
  screen.getByRole("heading", { name: "Add Another Device", level: 2 });
});

test("'Add Device' link in the Add Another Device section navigates to /devices/pair", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Add Another Device", level: 2 });
  const link = screen.getByRole("link", { name: "Add Device" });
  expect(link.getAttribute("href")).toBe("/devices/pair");
});

// ── Error state ───────────────────────────────────────────────────────────────

test("renders an error heading when the API call rejects with 'Network error'", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
  renderPage();
  await screen.findByRole("heading", { name: "Failed to load devices", level: 2 });
});

test("shows the error message text when the API rejects with 'Network error'", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
  renderPage();
  await screen.findByText("Network error");
});

test("renders a 'Retry' button when the API call fails", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("Network error"));
  renderPage();
  await screen.findByRole("button", { name: "Retry" });
});

// ── Sidebar navigation ────────────────────────────────────────────────────────

test("sidebar nav renders '📊 Dashboard' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("sidebar nav renders '👤 My Account' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "👤 My Account" });
});

test("sidebar nav renders '🤝 Partners & Services' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("sidebar nav renders 'Log out' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeResponse([]));
  renderPage();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "Log out" });
});

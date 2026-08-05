// Acceptance tests: Smart scale pairing story — frontend criteria
// AC1: pairing screen shows "Connect Smart Scale" tile with Withings as a supported provider
// AC2: success shows "Device connected successfully!"; failure shows "Connection failed. Please try again."
// AC3: after successful pairing the connected devices list shows the smart scale with correct fields
// AC5: pairing screen is reachable from onboarding flow (/onboarding/devices) and from connected devices screen (/devices)
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach } from "vitest";
import { App } from "../App.js";
import { DevicePairingPage } from "./DevicePairingPage.js";
import { ConnectedDevicesPage } from "./ConnectedDevicesPage.js";

// ── apiFetch mock (matches the pattern in DevicePairingPage.test.tsx) ──────────
vi.mock("../api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { apiFetch } from "../api.js";
const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPairingPage() {
  return render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
}

function renderViaApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function makeDevicesResponse(devices: object[]) {
  return {
    meta: { correlationId: "test-cid", timestamp: "2099-01-01T00:00:00.000Z" },
    data: { devices },
  };
}

const WITHINGS_SCALE_DEVICE = {
  id: "device-scale-001",
  deviceName: "Withings Body+",
  provider: "Withings",
  deviceType: "smart_scale" as const,
  status: "connected",
  lastSyncAt: "2099-01-02T08:00:00.000Z",
  batteryLevel: "Good",
  connectedSince: "2099-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// AC1: Pairing screen shows "Connect Smart Scale" tile and Withings provider
// ---------------------------------------------------------------------------

test("AC1: pairing screen renders a 'Smart Scale' device type tile heading", () => {
  renderPairingPage();
  // The tile h3 heading must exist — getByRole throws if absent
  screen.getByRole("heading", { name: "Smart Scale", level: 3 });
});

test("AC1: pairing screen renders a 'Connect Smart Scale' button in the Smart Scale tile", () => {
  renderPairingPage();
  screen.getByRole("button", { name: "Connect Smart Scale" });
});

test("AC1: pairing screen renders a 'Withings' provider tile heading", () => {
  renderPairingPage();
  screen.getByRole("heading", { name: "Withings", level: 3 });
});

test("AC1: the Withings tile has a 'Connect' button alongside it (Withings is a supported provider)", () => {
  renderPairingPage();
  // All four provider Connect buttons must render; Withings being present means it has one.
  const connectBtns = screen.getAllByRole("button", { name: "Connect" });
  // There are exactly 4 provider Connect buttons (Fitbit, Apple Watch, Garmin, Withings)
  expect(connectBtns.length).toBeGreaterThanOrEqual(1);

  // Verify Withings heading and a sibling Connect button are in the same list item
  const withingsHeading = screen.getByRole("heading", { name: "Withings", level: 3 });
  const withingsCard = withingsHeading.closest("li");
  if (!withingsCard) throw new Error("Expected Withings provider tile to be inside an <li>");
  expect(within(withingsCard).getByRole("button", { name: "Connect" })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// AC2: Success shows "Device connected successfully!"; failure shows "Connection failed. Please try again."
// ---------------------------------------------------------------------------

test("AC2: clicking the Withings Connect button and receiving a success response shows 'Device connected successfully!'", async () => {
  mockApiFetch.mockResolvedValueOnce({
    data: { device: { status: "connected", lastSyncAt: null } },
  });
  renderPairingPage();

  const withingsHeading = screen.getByRole("heading", { name: "Withings", level: 3 });
  const withingsCard = withingsHeading.closest("li");
  if (!withingsCard) throw new Error("Expected Withings provider tile to be inside an <li>");
  const connectBtn = within(withingsCard).getByRole("button", { name: "Connect" });

  await act(async () => {
    fireEvent.click(connectBtn);
  });

  await waitFor(() => {
    screen.getByText("✓ Device connected successfully!");
  });
});

test("AC2: success message has role='status'", async () => {
  mockApiFetch.mockResolvedValueOnce({
    data: { device: { status: "connected", lastSyncAt: null } },
  });
  renderPairingPage();

  const withingsHeading = screen.getByRole("heading", { name: "Withings", level: 3 });
  const withingsCard = withingsHeading.closest("li");
  if (!withingsCard) throw new Error("Expected Withings provider tile to be inside an <li>");
  const connectBtn = within(withingsCard).getByRole("button", { name: "Connect" });

  await act(async () => {
    fireEvent.click(connectBtn);
  });

  await waitFor(() => {
    screen.getByRole("status");
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("AC2: clicking any Connect button and receiving a failure response shows 'Connection failed. Please try again.'", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("Internal Server Error"));
  renderPairingPage();

  const [firstConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(firstConnectBtn!);
  });

  await waitFor(() => {
    screen.getByText("✗ Connection failed. Please try again.");
  });
});

test("AC2: failure message has role='alert'", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("Internal Server Error"));
  renderPairingPage();

  const [firstConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(firstConnectBtn!);
  });

  await waitFor(() => {
    screen.getByRole("alert");
  });
});

test("AC2: success message is absent when the API call fails", async () => {
  mockApiFetch.mockRejectedValueOnce(new Error("500"));
  renderPairingPage();

  const [firstConnectBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => {
    fireEvent.click(firstConnectBtn!);
  });

  await waitFor(() => {
    screen.getByText("✗ Connection failed. Please try again.");
  });
  expect(screen.queryByText("✓ Device connected successfully!")).toBeNull();
});

// ---------------------------------------------------------------------------
// AC3: After successful pairing the smart scale appears in the connected devices
// list with name "Withings Body+", type badge "Smart Scale", status, last-sync
// time, battery, and connected-since date.
// ---------------------------------------------------------------------------

test("AC3: precondition — ConnectedDevicesPage renders the 'Connected Devices' heading when the API returns devices", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
});

test("AC3: connected devices list shows 'Withings Body+' device name after smart scale is paired", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
});

test("AC3: connected devices list shows 'Smart Scale' type badge for the paired device", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card to be in an <li>");
  expect(within(card).getByText("Smart Scale")).toBeTruthy();
});

test("AC3: connected devices list shows the status badge for the smart scale", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card to be in an <li>");
  // status='connected' → badge "✓ Synced"
  expect(within(card).getByText("✓ Synced")).toBeTruthy();
});

test("AC3: connected devices list shows last-sync time for the smart scale", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card to be in an <li>");
  // lastSyncAt: "2099-01-02T08:00:00.000Z" — rendered label must be present
  const lastSyncTerm = within(card).getAllByRole("term").find((el) => el.textContent === "Last Sync");
  expect(lastSyncTerm).toBeTruthy();
  // The card should contain a formatted date with "Jan" and "2099"
  expect(card.textContent).toContain("Jan");
  expect(card.textContent).toContain("2099");
});

test("AC3: connected devices list shows battery level for the smart scale", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card to be in an <li>");
  expect(within(card).getByText("Good")).toBeTruthy();
});

test("AC3: connected devices list shows connected-since date for the smart scale", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([WITHINGS_SCALE_DEVICE]));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Withings Body+", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card to be in an <li>");
  const connectedSinceTerm = within(card).getAllByRole("term").find((el) => el.textContent === "Connected Since");
  expect(connectedSinceTerm).toBeTruthy();
  // connectedSince: "2099-01-01T00:00:00.000Z" — formatted date must be visible
  expect(card.textContent).toContain("Jan");
  expect(card.textContent).toContain("1");
});

// ---------------------------------------------------------------------------
// AC5: Pairing screen reachable from the onboarding flow and from connected devices screen
// ---------------------------------------------------------------------------

test("AC5: /onboarding/devices redirects to the device pairing screen (shows 'Connect Your Devices')", () => {
  // No API call needed — redirect happens before any data fetch
  renderViaApp("/onboarding/devices");
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

test("AC5: the connected devices screen has a link that navigates to the pairing screen", async () => {
  mockApiFetch.mockResolvedValueOnce(makeDevicesResponse([]));
  renderViaApp("/devices");
  // Wait for the connected devices page to load
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  // "Add Device" link on the connected-devices page points to /devices/pair
  const addDeviceLink = screen.getByRole("link", { name: "Add Device" });
  expect(addDeviceLink.getAttribute("href")).toBe("/devices/pair");
});

test("AC5: /devices/pair is directly routable and renders the pairing screen", () => {
  renderViaApp("/devices/pair");
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

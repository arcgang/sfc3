/**
 * Acceptance tests for "View and manage all connected device statuses" — frontend side.
 *
 * These tests exercise ALL tasks together through the App router:
 *   - Backend task: GET /devices/connections DTO shape
 *   - Frontend routing task: /devices route registered in App under Layout
 *   - Frontend page task: ConnectedDevicesPage renders within authenticated shell
 *
 * What the unit tests in ConnectedDevicesPage.test.tsx do NOT cover:
 *   - The /devices route is wired under <Layout> (so sidebar renders)
 *   - The API mock returns the exact DTO shape the backend toDeviceDto() produces
 *   - AC1–AC6 exercised end-to-end through the real App routing tree
 *
 * Criterion labels map to the story's acceptance criteria.
 */

import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "./App.js";

vi.mock("./api.js", () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { apiFetch } from "./api.js";
const mockApiFetch = vi.mocked(apiFetch);

// Fixtures reflecting the exact shape toDeviceDto() produces from the backend
const CONNECTED_SMARTWATCH = {
  id: "dev-fitbit-001",
  deviceName: "Fitbit Charge 5",
  provider: "Fitbit",
  deviceType: "smartwatch" as const,
  status: "connected",
  lastSyncAt: "2026-01-17T08:30:00.000Z",
  lastSuccessfulSyncAt: "2026-01-17T08:30:00.000Z",
  batteryLevel: "78%",
  connectedSince: "2026-01-15T00:00:00.000Z",
};

const STALE_SCALE = {
  id: "dev-withings-002",
  deviceName: "Withings Body+",
  provider: "Withings",
  deviceType: "smart_scale" as const,
  status: "pending",
  lastSyncAt: "2026-01-16T14:00:00.000Z",
  lastSuccessfulSyncAt: null,
  batteryLevel: "Good",
  connectedSince: "2026-01-15T00:00:00.000Z",
};

const ERROR_SMARTWATCH = {
  id: "dev-apple-003",
  deviceName: "Apple Watch Series 8",
  provider: "Apple",
  deviceType: "smartwatch" as const,
  status: "error",
  lastSyncAt: "2026-01-14T10:00:00.000Z",
  lastSuccessfulSyncAt: null,
  batteryLevel: "Unknown",
  connectedSince: "2025-12-20T00:00:00.000Z",
};

function makeConnectionsResponse(
  devices: typeof CONNECTED_SMARTWATCH[],
) {
  return {
    meta: { correlationId: "acc-test-cid", timestamp: "2026-01-17T10:00:00.000Z" },
    data: { devices },
  };
}

function renderViaApp() {
  return render(
    <MemoryRouter initialEntries={["/devices"]}>
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

// ── Precondition: route wired in App under Layout ────────────────────────────

test("precondition: App mounts a route at /devices rendering 'Connected Devices' heading (routing task landed)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Connected Devices",
    level: 1,
  });
  expect(heading).not.toBeNull();
});

// ── AC1: all paired devices listed under "Connected Devices" heading ──────────

test("AC1 — page heading is exactly 'Connected Devices' (h1)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
});

test("AC1 — all paired devices appear in the list when two devices are returned", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH, STALE_SCALE] as never[]),
  );
  renderViaApp();
  await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
  screen.getByRole("heading", { name: "Withings Body+", level: 2 });
});

test("AC1 — GET /devices/connections is called with an AbortSignal (confirming the real API endpoint is hit)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  expect(mockApiFetch).toHaveBeenCalledWith(
    "/devices/connections",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

// ── AC2: device card fields ────────────────────────────────────────────────────

test("AC2 — device name is shown as an h2 heading on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
});

test("AC2 — smartwatch type badge 'Smartwatch' is shown on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("Smartwatch")).toBeTruthy();
});

test("AC2 — smart scale type badge 'Smart Scale' is shown on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([STALE_SCALE] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Withings Body+",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("Smart Scale")).toBeTruthy();
});

test("AC2 — connection state badge '✓ Synced' is shown for status=connected device", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("✓ Synced")).toBeTruthy();
});

test("AC2 — connection state badge '⚠ Stale Data' is shown for status=pending device", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([STALE_SCALE] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Withings Body+",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("⚠ Stale Data")).toBeTruthy();
});

test("AC2 — connection state badge '✗ Sync Failed' is shown for status=error device", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([ERROR_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Apple Watch Series 8",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("✗ Sync Failed")).toBeTruthy();
});

test("AC2 — lastSyncAt timestamp is shown on the card (contains 'Jan' and '2026' from the fixture)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(card.textContent).toContain("Jan");
  expect(card.textContent).toContain("2026");
});

test("AC2 — 'Last Sync' label is present as a definition term on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const terms = within(card).getAllByRole("term");
  const lastSyncTerm = terms.find((el) => el.textContent === "Last Sync");
  expect(lastSyncTerm).toBeTruthy();
});

test("AC2 — battery level '78%' is displayed on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("78%")).toBeTruthy();
});

test("AC2 — 'Battery' label is present as a definition term on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const terms = within(card).getAllByRole("term");
  const batteryTerm = terms.find((el) => el.textContent === "Battery");
  expect(batteryTerm).toBeTruthy();
});

test("AC2 — connectedSince date is shown on the card (contains 'Jan' and '15' from the fixture)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(card.textContent).toContain("Jan");
  expect(card.textContent).toContain("15");
});

test("AC2 — 'Connected Since' label is present as a definition term on the card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const terms = within(card).getAllByRole("term");
  const connSinceTerm = terms.find(
    (el) => el.textContent === "Connected Since",
  );
  expect(connSinceTerm).toBeTruthy();
});

// ── AC3: stale = yellow badge, sync-failed = red badge ───────────────────────

test("AC3 — stale device (status=pending) badge has statusWarning CSS class (yellow)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([STALE_SCALE] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Withings Body+",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const badge = within(card).getByText("⚠ Stale Data");
  expect(badge.className).toContain("statusWarning");
});

test("AC3 — sync-failed device (status=error) badge has statusError CSS class (red)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([ERROR_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Apple Watch Series 8",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const badge = within(card).getByText("✗ Sync Failed");
  expect(badge.className).toContain("statusError");
});

test("AC3 — connected device badge has statusSynced CSS class (green, not yellow/red)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  const badge = within(card).getByText("✓ Synced");
  expect(badge.className).toContain("statusSynced");
  expect(badge.className).not.toContain("statusWarning");
  expect(badge.className).not.toContain("statusError");
});

// ── AC4: action buttons — Sync Now, Reconnect, Disconnect ────────────────────

test("AC4 — 'Sync Now' button is shown for a connected device (status=connected)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Sync Now" })).toBeTruthy();
});

test("AC4 — 'Reconnect' button is shown for a stale device (status=pending)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([STALE_SCALE] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Withings Body+",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Reconnect" })).toBeTruthy();
});

test("AC4 — 'Reconnect' button is shown for a sync-failed device (status=error)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([ERROR_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Apple Watch Series 8",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Reconnect" })).toBeTruthy();
});

test("AC4 — 'Sync Now' is NOT shown for stale devices (only Reconnect is offered)", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([STALE_SCALE] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Withings Body+",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).queryByRole("button", { name: "Sync Now" })).toBeNull();
});

test("AC4 — 'Disconnect' button is present on a connected device card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Fitbit Charge 5",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

test("AC4 — 'Disconnect' button is present on a stale device card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([STALE_SCALE] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Withings Body+",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

test("AC4 — 'Disconnect' button is present on a sync-failed device card", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([ERROR_SMARTWATCH] as never[]),
  );
  renderViaApp();
  const heading = await screen.findByRole("heading", {
    name: "Apple Watch Series 8",
    level: 2,
  });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

// ── AC5: "Add Another Device" section with "Add Device" CTA ──────────────────

test("AC5 — 'Add Another Device' h2 heading appears below the device list", async () => {
  mockApiFetch.mockResolvedValueOnce(
    makeConnectionsResponse([CONNECTED_SMARTWATCH] as never[]),
  );
  renderViaApp();
  await screen.findByRole("heading", { name: "Fitbit Charge 5", level: 2 });
  screen.getByRole("heading", { name: "Add Another Device", level: 2 });
});

test("AC5 — 'Add Another Device' section is visible even with an empty device list", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("heading", { name: "Add Another Device", level: 2 });
});

test("AC5 — 'Add Device' CTA link is present in the section", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Add Another Device", level: 2 });
  const link = screen.getByRole("link", { name: "Add Device" });
  expect(link).toBeTruthy();
});

test("AC5 — 'Add Device' link href points to /devices/pair", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Add Another Device", level: 2 });
  const link = screen.getByRole("link", { name: "Add Device" });
  expect(link.getAttribute("href")).toBe("/devices/pair");
});

// ── AC6: sidebar navigation ───────────────────────────────────────────────────

test("AC6 — sidebar navigation landmark 'Sidebar navigation' is present on /devices", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("navigation", { name: "Sidebar navigation" });
});

test("AC6 — sidebar contains '📊 Dashboard' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("AC6 — sidebar contains '👤 My Account' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "👤 My Account" });
});

test("AC6 — sidebar contains '🤝 Partners & Services' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("AC6 — sidebar contains 'Log out' link", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  screen.getByRole("link", { name: "Log out" });
});

test("AC6 — /devices is rendered inside the authenticated Layout shell (not a public page)", async () => {
  // If Layout is not wrapping the route, the sidebar nav would be absent.
  // This test combines AC6 with the routing task seam verification.
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await screen.findByRole("heading", { name: "Connected Devices", level: 1 });
  // Both the page content and the sidebar must be present simultaneously
  expect(
    screen.queryByRole("navigation", { name: "Sidebar navigation" }),
  ).not.toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Connected Devices", level: 1 }),
  ).not.toBeNull();
});

// ── Seam: device list filters to authenticated user only ──────────────────────
// (Frontend calls /devices/connections which is auth-gated; the API mock here
//  simulates the backend filtering in toDeviceDto via the authenticated endpoint.)

test("seam — page calls the authenticated /devices/connections endpoint (not the public /devices endpoint)", async () => {
  mockApiFetch.mockResolvedValueOnce(makeConnectionsResponse([]));
  renderViaApp();
  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalled();
  });
  const calls = mockApiFetch.mock.calls;
  const connectionsCall = calls.find(
    ([path]) => typeof path === "string" && path === "/devices/connections",
  );
  expect(connectionsCall).toBeDefined();
  const publicDevicesCall = calls.find(
    ([path]) => typeof path === "string" && path === "/devices",
  );
  expect(publicDevicesCall).toBeUndefined();
});

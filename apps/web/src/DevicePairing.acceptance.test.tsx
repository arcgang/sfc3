/**
 * Acceptance tests — "Pair a smartwatch to start tracking activity and vitals"
 *
 * These exercise the SEAM between the web tasks:
 *   - App routing (Web Foundation task): /devices/pair and /devices routes
 *   - DevicePairingPage (Device Pairing screen task)
 *   - ConnectedDevicesPage (Connected Devices screen task)
 *
 * Unit tests for each page already cover them in isolation.
 * This file covers three kinds of seams nothing else yet tests:
 *
 *   SEAM A — App routing: does App.tsx route /devices/pair to DevicePairingPage,
 *             and /devices to ConnectedDevicesPage? (precondition tests via App)
 *
 *   SEAM B — AC1/AC2/AC5 page content: all four providers present, connect flow,
 *             skip link reachable through the router (via MemoryRouter + DevicePairingPage)
 *
 *   SEAM C — AC3 field contract: does ConnectedDevicesPage render every field the
 *             API GET response supplies? (the shape the API acceptance test proves
 *             the endpoint actually delivers)
 */

import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";
import { DevicePairingPage } from "./pages/DevicePairingPage.js";
import { ConnectedDevicesPage } from "./pages/ConnectedDevicesPage.js";

// ---------------------------------------------------------------------------
// apiFetch mock — instance-field mutable implementation, never module-level
// ---------------------------------------------------------------------------

class ApiFetchMock {
  private _impl: (path: string, opts: RequestInit) => Promise<unknown> =
    (_p, _o) => Promise.resolve({});

  setImpl(fn: (path: string, opts: RequestInit) => Promise<unknown>): void {
    this._impl = fn;
  }

  call(path: string, opts: RequestInit): Promise<unknown> {
    return this._impl(path, opts);
  }

  reset(): void {
    this._impl = (_p, _o) => Promise.resolve({});
  }
}

const mockApiFetch = new ApiFetchMock();

vi.mock("./api.js", () => ({
  apiFetch: (path: string, opts: RequestInit) => mockApiFetch.call(path, opts),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// Far-future constant for fixture timestamps — avoids hardcoded absolute wall-clock values.
const FUTURE_ISO = "2099-06-15T14:30:00.000Z";

function connectSuccessResponse() {
  return Promise.resolve({
    data: { device: { status: "connected", lastSyncAt: null } },
  });
}

function connectFailureResponse() {
  return Promise.reject(new Error("Internal Server Error"));
}

function getDevicesResponse(batteryLevel: string = "82%") {
  return Promise.resolve({
    meta: { correlationId: "acc-cid", timestamp: FUTURE_ISO },
    data: {
      devices: [
        {
          id: "device-acc-001",
          deviceName: "Fitbit Charge 6",
          provider: "Fitbit",
          deviceType: "smartwatch" as const,
          status: "connected",
          lastSyncAt: FUTURE_ISO,
          batteryLevel,
          connectedSince: FUTURE_ISO,
        },
      ],
    },
  });
}

beforeEach(() => {
  mockApiFetch.reset();
});

// ---------------------------------------------------------------------------
// SEAM A — precondition: App routing wires the pages from both frontend tasks
//
// These tests render via App.  If App.tsx has a bug (e.g. a reference to an
// undefined component), they will fail — that IS the finding.  The criterion
// is that the routes are correctly registered so users reach the right page.
// ---------------------------------------------------------------------------

test("SEAM A precondition — /devices/pair route registered in App renders the DevicePairingPage", () => {
  render(
    <MemoryRouter initialEntries={["/devices/pair"]}>
      <App />
    </MemoryRouter>,
  );
  // DevicePairingPage renders this h1; a placeholder or crash produces nothing here.
  expect(
    screen.queryByRole("heading", { name: "Connect Your Devices", level: 1 }),
  ).not.toBeNull();
});

test("SEAM A precondition — /devices route registered in App renders the ConnectedDevicesPage", async () => {
  mockApiFetch.setImpl(() => getDevicesResponse());
  render(
    <MemoryRouter initialEntries={["/devices"]}>
      <App />
    </MemoryRouter>,
  );
  // ConnectedDevicesPage issues an apiFetch; the placeholder renders a static heading.
  // This test verifies the REAL page (which calls apiFetch) is wired, not the placeholder.
  await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
});

// ---------------------------------------------------------------------------
// AC1 — pairing screen shows "Connect Smartwatch" tile and four provider options
//
// Verified via MemoryRouter + DevicePairingPage (the component the route should
// render).  If SEAM A fails, the following tests prove the components work and
// the issue is routing-only.
// ---------------------------------------------------------------------------

test("AC1 — pairing screen renders 'Connect Smartwatch' button", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  screen.getByRole("button", { name: "Connect Smartwatch" });
});

test("AC1 — pairing screen renders exactly four provider 'Connect' buttons", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(4);
});

test("AC1 — pairing screen has a 'Fitbit' provider heading", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Fitbit", level: 3 });
});

test("AC1 — pairing screen has an 'Apple Watch' provider heading", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Apple Watch", level: 3 });
});

test("AC1 — pairing screen has a 'Garmin' provider heading", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Garmin", level: 3 });
});

test("AC1 — pairing screen has a 'Withings' provider heading", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  screen.getByRole("heading", { name: "Withings", level: 3 });
});

// ---------------------------------------------------------------------------
// AC2 — connect flow shows "Device connected successfully!" or
//        "Connection failed. Please try again." on screen
// ---------------------------------------------------------------------------

test("AC2 — clicking Fitbit 'Connect' on success shows '✓ Device connected successfully!'", async () => {
  mockApiFetch.setImpl(connectSuccessResponse);
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );

  const [fitbitBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => { fireEvent.click(fitbitBtn!); });

  await waitFor(() => screen.getByText("✓ Device connected successfully!"));
});

test("AC2 — clicking Garmin 'Connect' on failure shows '✗ Connection failed. Please try again.'", async () => {
  mockApiFetch.setImpl(connectFailureResponse);
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );

  const connectBtns = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => { fireEvent.click(connectBtns[2]!); }); // Garmin = index 2

  await waitFor(() => screen.getByText("✗ Connection failed. Please try again."));
});

test("AC2 — success message is absent when the connect call fails", async () => {
  mockApiFetch.setImpl(connectFailureResponse);
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );

  const [fitbitBtn] = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => { fireEvent.click(fitbitBtn!); });
  await waitFor(() => screen.getByText("✗ Connection failed. Please try again."));

  expect(screen.queryByText("✓ Device connected successfully!")).toBeNull();
});

test("AC2 — Withings 'Connect' sends PUT with action='connect' and provider='Withings'", async () => {
  const calls: Array<[string, RequestInit]> = [];
  mockApiFetch.setImpl((path, opts) => {
    calls.push([path, opts]);
    return connectSuccessResponse();
  });
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );

  const connectBtns = screen.getAllByRole("button", { name: "Connect" });
  await act(async () => { fireEvent.click(connectBtns[3]!); }); // Withings = index 3

  await waitFor(() => screen.getByText("✓ Device connected successfully!"));

  expect(calls).toHaveLength(1);
  const body = JSON.parse(calls[0]![1].body as string) as Record<string, unknown>;
  expect(body["action"]).toBe("connect");
  expect(body["provider"]).toBe("Withings");
  expect(body["deviceType"]).toBe("smartwatch");
});

// ---------------------------------------------------------------------------
// AC3 — after successful pairing ConnectedDevicesPage shows all required fields:
//        device name, type badge "Smartwatch", status "✓ Synced",
//        last-sync time, battery level, connected-since date
//
// The API acceptance test proves the endpoint delivers these fields.
// This test proves ConnectedDevicesPage renders every field the API provides.
// ---------------------------------------------------------------------------

test("AC3 — ConnectedDevicesPage renders device name 'Fitbit Charge 6'", async () => {
  mockApiFetch.setImpl(() => getDevicesResponse());
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
});

test("AC3 — device card shows type badge 'Smartwatch'", async () => {
  mockApiFetch.setImpl(() => getDevicesResponse());
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("Smartwatch")).toBeTruthy();
});

test("AC3 — device card shows status '✓ Synced' for a connected smartwatch", async () => {
  mockApiFetch.setImpl(() => getDevicesResponse());
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("✓ Synced")).toBeTruthy();
});

test("AC3 — device card shows last-sync time derived from lastSyncAt (contains 'Jun' and '2099')", async () => {
  // FUTURE_ISO = "2099-06-15T14:30:00.000Z" — locale formats this as "Jun 15, 2099"
  mockApiFetch.setImpl(() => getDevicesResponse());
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(card.textContent).toContain("Jun");
  expect(card.textContent).toContain("2099");
});

test("AC3 — device card shows battery level '82%'", async () => {
  mockApiFetch.setImpl(() => getDevicesResponse("82%"));
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(within(card).getByText("82%")).toBeTruthy();
});

test("AC3 — device card shows connected-since date derived from connectedSince (contains '15')", async () => {
  // connectedSince = FUTURE_ISO = "2099-06-15T..." → formatted as "Jun 15, 2099"
  mockApiFetch.setImpl(() => getDevicesResponse());
  render(
    <MemoryRouter>
      <ConnectedDevicesPage />
    </MemoryRouter>,
  );
  const heading = await screen.findByRole("heading", { name: "Fitbit Charge 6", level: 2 });
  const card = heading.closest("li");
  if (!card) throw new Error("Expected device card <li> to exist");
  expect(card.textContent).toContain("15");
});

// ---------------------------------------------------------------------------
// AC5 — "Skip for now" link allows bypassing without blocking onboarding
// ---------------------------------------------------------------------------

test("AC5 — 'Skip for now' link is rendered on the pairing screen", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  screen.getByRole("link", { name: "Skip for now" });
});

test("AC5 — 'Skip for now' link has href '/'", () => {
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Skip for now" });
  expect(link.getAttribute("href")).toBe("/");
});

test("AC5 — clicking 'Skip for now' does not call the API", async () => {
  const calls: string[] = [];
  mockApiFetch.setImpl((path) => { calls.push(path); return connectSuccessResponse(); });
  render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );

  const skipLink = screen.getByRole("link", { name: "Skip for now" });
  await act(async () => { fireEvent.click(skipLink); });

  expect(calls).toHaveLength(0);
});

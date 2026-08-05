import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, beforeEach, afterEach } from "vitest";
import { App } from "../App.js";
import { DevicePairingPage } from "./DevicePairingPage.js";

function renderDevicePairingPage() {
  return render(
    <MemoryRouter>
      <DevicePairingPage />
    </MemoryRouter>,
  );
}

function renderViaApp(path = "/devices/pair") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Route registration ────────────────────────────────────────────────────────

test("/devices/pair route renders the Connect Your Devices heading", () => {
  renderViaApp("/devices/pair");
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

test("/onboarding/devices redirects to /devices/pair", () => {
  renderViaApp("/onboarding/devices");
  screen.getByRole("heading", { name: "Connect Your Devices", level: 1 });
});

// ── Device type tiles ─────────────────────────────────────────────────────────

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

  await waitFor(() => {
    screen.getByText("✓ Device connected successfully!");
  });
});

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

  await waitFor(() => {
    screen.getByText("✗ Connection failed. Please try again.");
  });
});

test("failure message is shown when the API call rejects entirely", async () => {
  const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
  vi.stubGlobal("fetch", mockFetch);

  renderDevicePairingPage();
  fireEvent.click(screen.getByRole("button", { name: "Connect Withings" }));

  await waitFor(() => {
    screen.getByText("✗ Connection failed. Please try again.");
  });
});

// ── No success/failure message initially ──────────────────────────────────────

test("no success or failure message is shown before any connect action", () => {
  renderDevicePairingPage();
  expect(screen.queryByText("✓ Device connected successfully!")).toBeNull();
  expect(screen.queryByText("✗ Connection failed. Please try again.")).toBeNull();
});

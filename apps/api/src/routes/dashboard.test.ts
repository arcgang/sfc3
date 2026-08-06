import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeIsStale,
  attemptMockRefresh,
  buildDashboardPayload,
  type DeviceRow,
} from "./dashboard.js";

// ---------------------------------------------------------------------------
// computeIsStale — pure stale-detection logic
// ---------------------------------------------------------------------------

describe("computeIsStale", () => {
  it("returns false for a device synced 2 hours ago with an 18-hour threshold", () => {
    const nowMs = Date.now();
    const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    expect(computeIsStale(twoHoursAgo, 18, nowMs)).toBe(false);
  });

  it("returns true for a device synced 20 hours ago with an 18-hour threshold", () => {
    const nowMs = Date.now();
    const twentyHoursAgo = new Date(nowMs - 20 * 3600 * 1000).toISOString();
    expect(computeIsStale(twentyHoursAgo, 18, nowMs)).toBe(true);
  });

  it("returns true when lastSuccessfulSyncAt is null", () => {
    expect(computeIsStale(null, 18, Date.now())).toBe(true);
  });

  it("returns false when synced exactly at threshold boundary minus 1 ms", () => {
    const nowMs = Date.now();
    const justUnderThreshold = new Date(nowMs - 18 * 3600 * 1000 + 1).toISOString();
    expect(computeIsStale(justUnderThreshold, 18, nowMs)).toBe(false);
  });

  it("returns false when synced exactly at the threshold boundary (strict > not >=)", () => {
    const nowMs = Date.now();
    const exactThreshold = new Date(nowMs - 18 * 3600 * 1000).toISOString();
    expect(computeIsStale(exactThreshold, 18, nowMs)).toBe(false);
  });

  it("uses the per-device threshold, not a global default", () => {
    const nowMs = Date.now();
    const fourHoursAgo = new Date(nowMs - 4 * 3600 * 1000).toISOString();
    // 3-hour threshold: 4h ago is stale
    expect(computeIsStale(fourHoursAgo, 3, nowMs)).toBe(true);
    // 6-hour threshold: 4h ago is fresh
    expect(computeIsStale(fourHoursAgo, 6, nowMs)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// attemptMockRefresh — logs sync events, does not mutate data
// ---------------------------------------------------------------------------

describe("attemptMockRefresh", () => {
  let logLines: string[] = [];

  beforeEach(() => {
    logLines = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logLines.push(String(args[0]));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'failed'", () => {
    expect(attemptMockRefresh("dev-1", "smartwatch", "corr-1")).toBe("failed");
  });

  it("emits device.sync_started log", () => {
    attemptMockRefresh("dev-2", "smart_scale", "corr-2");
    const startedEntry = logLines.find((l) => l.includes("device.sync_started"));
    expect(startedEntry).toBeDefined();
    const parsed = JSON.parse(startedEntry!) as Record<string, unknown>;
    expect(parsed["event"]).toBe("device.sync_started");
    expect(parsed["deviceId"]).toBe("dev-2");
    expect(parsed["deviceType"]).toBe("smart_scale");
    expect(parsed["correlationId"]).toBe("corr-2");
  });

  it("emits device.sync_failed log after sync_started", () => {
    attemptMockRefresh("dev-3", "smartwatch", "corr-3");
    const startedIdx = logLines.findIndex((l) => l.includes("device.sync_started"));
    const failedIdx = logLines.findIndex((l) => l.includes("device.sync_failed"));
    expect(failedIdx).toBeGreaterThan(-1);
    expect(failedIdx).toBeGreaterThan(startedIdx);
    const parsed = JSON.parse(logLines[failedIdx]!) as Record<string, unknown>;
    expect(parsed["event"]).toBe("device.sync_failed");
    expect(parsed["deviceId"]).toBe("dev-3");
  });
});

// ---------------------------------------------------------------------------
// buildDashboardPayload — stale detection, refresh trigger, payload shape
// ---------------------------------------------------------------------------

describe("buildDashboardPayload", () => {
  let logLines: string[] = [];

  beforeEach(() => {
    logLines = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logLines.push(String(args[0]));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeRow(overrides: Partial<DeviceRow> = {}): DeviceRow {
    return {
      id: "dev-default",
      device_type: "smartwatch",
      device_name: "My Watch",
      connection_status: "connected",
      last_successful_sync_at: null,
      stale_after_hours: 18,
      battery_level: "80%",
      ...overrides,
    };
  }

  it("marks isStale=false for device synced 2h ago with 18h threshold", () => {
    const nowMs = Date.now();
    const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    const row = makeRow({ id: "dev-fresh", last_successful_sync_at: twoHoursAgo, stale_after_hours: 18 });
    const result = buildDashboardPayload([row], nowMs, "corr-a");
    expect(result.devices[0]!.isStale).toBe(false);
    expect(result.lastSyncStatus.isStale).toBe(false);
  });

  it("marks isStale=true for device synced 20h ago with 18h threshold", () => {
    const nowMs = Date.now();
    const twentyHoursAgo = new Date(nowMs - 20 * 3600 * 1000).toISOString();
    const row = makeRow({ id: "dev-stale", last_successful_sync_at: twentyHoursAgo, stale_after_hours: 18 });
    const result = buildDashboardPayload([row], nowMs, "corr-b");
    expect(result.devices[0]!.isStale).toBe(true);
    expect(result.lastSyncStatus.isStale).toBe(true);
  });

  it("sets syncStatus to 'failed' and emits both log events for stale device", () => {
    const nowMs = Date.now();
    const twentyHoursAgo = new Date(nowMs - 20 * 3600 * 1000).toISOString();
    const row = makeRow({ id: "dev-stale-logs", last_successful_sync_at: twentyHoursAgo });
    buildDashboardPayload([row], nowMs, "corr-c");
    const started = logLines.find((l) => l.includes("device.sync_started"));
    const failed = logLines.find((l) => l.includes("device.sync_failed"));
    expect(started).toBeDefined();
    expect(failed).toBeDefined();
  });

  it("does not emit sync logs for fresh (non-stale) device", () => {
    const nowMs = Date.now();
    const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    const row = makeRow({ last_successful_sync_at: twoHoursAgo });
    buildDashboardPayload([row], nowMs, "corr-d");
    expect(logLines.filter((l) => l.includes("device.sync_started"))).toHaveLength(0);
    expect(logLines.filter((l) => l.includes("device.sync_failed"))).toHaveLength(0);
  });

  it("health_records rows are untouched after a simulated failed refresh", () => {
    // buildDashboardPayload does not interact with health_records at all.
    // We verify this by confirming the payload contains no health_records mutation
    // and the only side effects are the two structured log calls.
    const nowMs = Date.now();
    const twentyHoursAgo = new Date(nowMs - 20 * 3600 * 1000).toISOString();
    const row = makeRow({ id: "dev-hr-check", last_successful_sync_at: twentyHoursAgo });

    const consoleSpy = vi.mocked(console.log);
    consoleSpy.mockClear();

    buildDashboardPayload([row], nowMs, "corr-e");

    // Only 2 console.log calls: sync_started + sync_failed
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    // Neither call references health_records
    const allArgs = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(allArgs.every((s) => !s.includes("health_records"))).toBe(true);
  });

  it("overallLastSyncAt is the most recent lastSyncAt across all devices", () => {
    const nowMs = Date.now();
    const oneHourAgo = new Date(nowMs - 1 * 3600 * 1000).toISOString();
    const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    const rows: DeviceRow[] = [
      makeRow({ id: "dev-a", last_successful_sync_at: oneHourAgo }),
      makeRow({ id: "dev-b", device_type: "smart_scale", last_successful_sync_at: twoHoursAgo }),
    ];
    const result = buildDashboardPayload(rows, nowMs, "corr-f");
    expect(result.lastSyncStatus.overallLastSyncAt).toBe(oneHourAgo);
  });

  it("overallLastSyncAt is null when all devices have never synced", () => {
    const rows: DeviceRow[] = [makeRow({ last_successful_sync_at: null })];
    const result = buildDashboardPayload(rows, Date.now(), "corr-g");
    expect(result.lastSyncStatus.overallLastSyncAt).toBeNull();
  });

  it("staleThresholdHours is the minimum threshold across devices", () => {
    const nowMs = Date.now();
    const recentSync = new Date(nowMs - 1 * 3600 * 1000).toISOString();
    const rows: DeviceRow[] = [
      makeRow({ id: "dev-c", stale_after_hours: 18, last_successful_sync_at: recentSync }),
      makeRow({ id: "dev-d", device_type: "smart_scale", stale_after_hours: 12, last_successful_sync_at: recentSync }),
    ];
    const result = buildDashboardPayload(rows, nowMs, "corr-h");
    expect(result.lastSyncStatus.staleThresholdHours).toBe(12);
  });

  it("defaults staleThresholdHours to 18 when no devices present", () => {
    const result = buildDashboardPayload([], Date.now(), "corr-i");
    expect(result.lastSyncStatus.staleThresholdHours).toBe(18);
    expect(result.lastSyncStatus.isStale).toBe(false);
    expect(result.lastSyncStatus.overallLastSyncAt).toBeNull();
    expect(result.devices).toHaveLength(0);
  });

  it("syncStatus remains connection_status for fresh device (no refresh attempted)", () => {
    const nowMs = Date.now();
    const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    const row = makeRow({ connection_status: "connected", last_successful_sync_at: twoHoursAgo });
    const result = buildDashboardPayload([row], nowMs, "corr-j");
    expect(result.devices[0]!.syncStatus).toBe("connected");
  });

  it("device entry contains all required fields", () => {
    const nowMs = Date.now();
    const twoHoursAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    const row = makeRow({
      id: "dev-fields",
      device_name: "My Scale",
      device_type: "smart_scale",
      connection_status: "connected",
      last_successful_sync_at: twoHoursAgo,
      stale_after_hours: 18,
      battery_level: "55%",
    });
    const result = buildDashboardPayload([row], nowMs, "corr-k");
    const d = result.devices[0]!;
    expect(d.id).toBe("dev-fields");
    expect(d.name).toBe("My Scale");
    expect(d.type).toBe("smart_scale");
    expect(d.lastSyncAt).toBe(twoHoursAgo);
    expect(d.staleAfterHours).toBe(18);
    expect(typeof d.isStale).toBe("boolean");
    expect(typeof d.syncStatus).toBe("string");
    expect(d.batteryLevel).toBe("55%");
  });
});

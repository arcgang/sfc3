import { describe, it, expect } from "vitest";
import { assignAlertPriority } from "./alertPriorityMatrix.js";
import type { AlertRuleResults } from "./alertPriorityMatrix.js";

function base(): AlertRuleResults {
  return {
    staleDeviceCount: 0,
    totalDeviceCount: 2,
    hasAbnormalReading: false,
    hasSyncFailure: false,
    hasGoalRisk: false,
    hasInformationalSyncLag: false,
  };
}

describe("assignAlertPriority", () => {
  it("returns 'high' when all 2 of 2 devices are stale", () => {
    expect(assignAlertPriority({ ...base(), staleDeviceCount: 2, totalDeviceCount: 2 })).toBe("high");
  });

  it("returns 'medium' when 1 of 2 devices is stale", () => {
    expect(assignAlertPriority({ ...base(), staleDeviceCount: 1, totalDeviceCount: 2 })).toBe("medium");
  });

  it("returns 'high' when 0 of 2 devices are stale but there is an abnormal reading", () => {
    expect(assignAlertPriority({ ...base(), staleDeviceCount: 0, hasAbnormalReading: true })).toBe("high");
  });

  it("returns 'high' when 0 total devices and there is an abnormal reading", () => {
    expect(
      assignAlertPriority({ ...base(), staleDeviceCount: 0, totalDeviceCount: 0, hasAbnormalReading: true }),
    ).toBe("high");
  });

  it("returns 'medium' when only a sync failure is present", () => {
    expect(assignAlertPriority({ ...base(), hasSyncFailure: true })).toBe("medium");
  });

  it("returns 'medium' when only a goal risk is present", () => {
    expect(assignAlertPriority({ ...base(), hasGoalRisk: true })).toBe("medium");
  });

  it("returns 'low' when only an informational sync lag is present", () => {
    expect(assignAlertPriority({ ...base(), hasInformationalSyncLag: true })).toBe("low");
  });

  it("returns 'low' when 0 total devices and no anomaly condition is set", () => {
    expect(
      assignAlertPriority({ ...base(), staleDeviceCount: 0, totalDeviceCount: 0 }),
    ).toBe("low");
  });

  it("returns 'high' (not doubled) when all devices are stale AND there is an abnormal reading simultaneously", () => {
    expect(
      assignAlertPriority({
        ...base(),
        staleDeviceCount: 2,
        totalDeviceCount: 2,
        hasAbnormalReading: true,
      }),
    ).toBe("high");
  });
});

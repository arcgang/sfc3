import { describe, it, expect } from "vitest";
import { loadAlertThresholdConfig } from "./alertConfig.js";

describe("loadAlertThresholdConfig", () => {
  it("returns an object with goal_risk, staleAfterHours, and abnormalReadingThresholds present", () => {
    const config = loadAlertThresholdConfig({});
    expect(typeof config.goal_risk).toBe("number");
    expect(typeof config.staleAfterHours).toBe("object");
    expect(typeof config.abnormalReadingThresholds).toBe("object");
  });

  it("goal_risk default is a number between 0 and 1 exclusive", () => {
    const config = loadAlertThresholdConfig({});
    expect(config.goal_risk).toBeGreaterThan(0);
    expect(config.goal_risk).toBeLessThan(1);
  });

  it("staleAfterHours.smartwatch defaults to 18", () => {
    const config = loadAlertThresholdConfig({});
    expect(config.staleAfterHours["smartwatch"]).toBe(18);
  });

  it("staleAfterHours.smart_scale defaults to 18", () => {
    const config = loadAlertThresholdConfig({});
    expect(config.staleAfterHours["smart_scale"]).toBe(18);
  });

  it("reads ALERT_STALE_SMARTWATCH_HOURS from env", () => {
    const config = loadAlertThresholdConfig({ ALERT_STALE_SMARTWATCH_HOURS: "24" });
    expect(config.staleAfterHours["smartwatch"]).toBe(24);
  });

  it("reads ALERT_STALE_SMART_SCALE_HOURS from env", () => {
    const config = loadAlertThresholdConfig({ ALERT_STALE_SMART_SCALE_HOURS: "12" });
    expect(config.staleAfterHours["smart_scale"]).toBe(12);
  });

  it("reads ALERT_GOAL_RISK_THRESHOLD from env", () => {
    const config = loadAlertThresholdConfig({ ALERT_GOAL_RISK_THRESHOLD: "0.6" });
    expect(config.goal_risk).toBe(0.6);
  });

  it("parses ALERT_ABNORMAL_THRESHOLDS_JSON from env", () => {
    const json = JSON.stringify({ resting_heart_rate_bpm: { min: 40, max: 100 } });
    const config = loadAlertThresholdConfig({ ALERT_ABNORMAL_THRESHOLDS_JSON: json });
    expect(config.abnormalReadingThresholds["resting_heart_rate_bpm"]).toEqual({ min: 40, max: 100 });
  });

  it("returns empty abnormalReadingThresholds when env var is absent", () => {
    const config = loadAlertThresholdConfig({});
    expect(Object.keys(config.abnormalReadingThresholds)).toHaveLength(0);
  });
});

import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAlertThresholds, buildConfig } from "./config.js";

// ---------------------------------------------------------------------------
// loadAlertThresholds
// ---------------------------------------------------------------------------

describe("loadAlertThresholds", () => {
  it("loads staleAfterHours.smartwatch=18 from the default thresholds file", () => {
    const thresholds = loadAlertThresholds();
    expect(thresholds.staleAfterHours["smartwatch"]).toBe(18);
  });

  it("loads staleAfterHours.smart_scale=24 from the default thresholds file", () => {
    const thresholds = loadAlertThresholds();
    expect(thresholds.staleAfterHours["smart_scale"]).toBe(24);
  });

  it("loads abnormalReading.resting_heart_rate_bpm.high=100", () => {
    const thresholds = loadAlertThresholds();
    expect(thresholds.abnormalReading["resting_heart_rate_bpm"]?.high).toBe(100);
  });

  it("loads abnormalReading.resting_heart_rate_bpm.low=40", () => {
    const thresholds = loadAlertThresholds();
    expect(thresholds.abnormalReading["resting_heart_rate_bpm"]?.low).toBe(40);
  });

  it("loads a custom thresholds file written to a tmp path", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "config-test-"));
    const filePath = join(tmpDir, "thresholds.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        staleAfterHours: { smartwatch: 12 },
        abnormalReading: { heart_rate: { low: 50, high: 110 } },
      }),
    );
    try {
      const thresholds = loadAlertThresholds(filePath);
      expect(thresholds.staleAfterHours["smartwatch"]).toBe(12);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when file is missing required staleAfterHours key", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "config-test-"));
    const filePath = join(tmpDir, "bad.json");
    writeFileSync(filePath, JSON.stringify({ abnormalReading: {} }));
    try {
      expect(() => loadAlertThresholds(filePath)).toThrow();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// buildConfig
// ---------------------------------------------------------------------------

describe("buildConfig", () => {
  it("does not throw when JWT_SECRET is missing — falls back to dev default", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(() => buildConfig({})).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("emits a console.warn containing 'JWT_SECRET' when JWT_SECRET is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      buildConfig({});
      const warned = warnSpy.mock.calls.some((args) =>
        args.some((a) => typeof a === "string" && a.includes("JWT_SECRET")),
      );
      expect(warned).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("uses the dev fallback secret 'dev-secret-do-not-use-in-production' when JWT_SECRET is absent", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const cfg = buildConfig({});
      expect(cfg.jwtSecret).toBe("dev-secret-do-not-use-in-production");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns port=3001 when PORT is not set", () => {
    const cfg = buildConfig({ JWT_SECRET: "secret" });
    expect(cfg.port).toBe(3001);
  });

  it("returns port=4000 when PORT='4000'", () => {
    const cfg = buildConfig({ JWT_SECRET: "secret", PORT: "4000" });
    expect(cfg.port).toBe(4000);
  });

  it("returns alertThresholds with staleAfterHours key", () => {
    const cfg = buildConfig({ JWT_SECRET: "secret" });
    expect(cfg.alertThresholds.staleAfterHours).toBeDefined();
  });
});

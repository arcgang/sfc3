import { describe, it, expect } from "vitest";
import { health } from "./health.js";

describe("health", () => {
  it("reports ok with a non-negative uptime", () => {
    const h = health(0);
    expect(h.status).toBe("ok");
    expect(h.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

import { describe, it, expect } from "vitest";
import { buildConfig } from "./config.js";

describe("buildConfig", () => {
  it("reads PORT from env as a number", () => {
    expect(buildConfig({ PORT: "4567", JWT_SECRET: "secret" }).port).toBe(4567);
  });

  it("defaults port to 3000 when PORT is not set", () => {
    expect(buildConfig({ JWT_SECRET: "secret" }).port).toBe(3000);
  });

  it("reads JWT_SECRET from env", () => {
    expect(buildConfig({ JWT_SECRET: "my-secret" }).jwtSecret).toBe("my-secret");
  });

  it("throws with a message naming JWT_SECRET when it is missing", () => {
    expect(() => buildConfig({})).toThrow("JWT_SECRET");
  });
});

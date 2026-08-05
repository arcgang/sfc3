import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

export interface AlertThresholds {
  staleAfterHours: Record<string, number>;
  abnormalReading: Record<string, { low: number | null; high: number | null }>;
}

export interface Config {
  port: number;
  jwtSecret: string;
  alertThresholds: AlertThresholds;
}

const DEFAULT_THRESHOLDS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "alertThresholds.json",
);

export function loadAlertThresholds(path: string = DEFAULT_THRESHOLDS_PATH): AlertThresholds {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("staleAfterHours" in parsed) ||
    !("abnormalReading" in parsed)
  ) {
    throw new Error(`Invalid alert thresholds file at ${path}`);
  }
  return parsed as AlertThresholds;
}

export function buildConfig(env: Record<string, string | undefined>): Config {
  const jwtSecret = env["JWT_SECRET"];
  if (!jwtSecret) {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }
  const thresholdsPath = env["ALERT_THRESHOLDS_PATH"] ?? DEFAULT_THRESHOLDS_PATH;
  return {
    port: env["PORT"] ? Number(env["PORT"]) : 3001,
    jwtSecret,
    alertThresholds: loadAlertThresholds(thresholdsPath),
  };
}

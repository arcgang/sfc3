export interface AlertRuleResults {
  staleDeviceCount: number;
  totalDeviceCount: number;
  hasAbnormalReading: boolean;
  hasSyncFailure: boolean;
  hasGoalRisk: boolean;
  hasInformationalSyncLag: boolean;
}

export function assignAlertPriority(results: AlertRuleResults): "high" | "medium" | "low" {
  const allDevicesStale =
    results.totalDeviceCount > 0 && results.staleDeviceCount === results.totalDeviceCount;

  if (allDevicesStale || results.hasAbnormalReading) {
    return "high";
  }

  const someDevicesStale =
    results.staleDeviceCount > 0 && results.staleDeviceCount < results.totalDeviceCount;

  if (someDevicesStale || results.hasSyncFailure || results.hasGoalRisk) {
    return "medium";
  }

  return "low";
}

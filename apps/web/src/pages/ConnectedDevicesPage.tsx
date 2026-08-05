import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./ConnectedDevicesPage.module.css";

interface DeviceDto {
  id: string;
  deviceName: string;
  provider: string;
  deviceType: "smartwatch" | "smart_scale";
  status: string;
  lastSyncAt: string | null;
  batteryLevel: string | null;
  connectedSince: string;
}

interface GetConnectionsResponse {
  data: {
    devices: DeviceDto[];
  };
}

interface SyncResponse {
  data: {
    syncRunId: string;
    syncStatus: string;
    recordsWritten: number;
    recordsDiscarded: number;
  };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function deviceTypeLabel(deviceType: DeviceDto["deviceType"]): string {
  return deviceType === "smartwatch" ? "Smartwatch" : "Smart Scale";
}

function deviceIcon(deviceType: DeviceDto["deviceType"]): string {
  return deviceType === "smartwatch" ? "⌚" : "⚖️";
}

function statusBadge(status: string): string {
  switch (status) {
    case "connected":
      return "✓ Synced";
    case "disconnected":
      return "✗ Disconnected";
    case "error":
      return "✗ Sync Failed";
    case "pending":
      return "⚠ Stale Data";
    default:
      return status;
  }
}

interface ReconnectResponse {
  data: {
    device: DeviceDto;
  };
}

interface DeviceCardProps {
  device: DeviceDto;
  onSyncSuccess: (deviceId: string, syncedAt: string) => void;
  onReconnectSuccess: (updated: DeviceDto) => void;
  onDisconnectSuccess: (deviceId: string) => void;
}

function DeviceCard({ device, onSyncSuccess, onReconnectSuccess, onDisconnectSuccess }: DeviceCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleSyncNow() {
    setSyncing(true);
    setActionError(null);

    apiFetch<SyncResponse>(`/devices/${device.id}/sync`, { method: "POST" })
      .then((res) => {
        setSyncing(false);
        const syncedAt = new Date().toISOString();
        onSyncSuccess(device.id, syncedAt);
        if (res.data.syncStatus === "partial_discard") {
          setActionError(
            "Sync completed with partial data: some measurements were discarded due to missing required fields.",
          );
        }
      })
      .catch((err: unknown) => {
        setSyncing(false);
        setActionError(
          err instanceof Error ? err.message : "Sync failed. Please try again.",
        );
      });
  }

  function handleReconnect() {
    setReconnecting(true);
    setActionError(null);

    apiFetch<ReconnectResponse>(`/devices/${device.id}/reconnect`, { method: "POST" })
      .then((res) => {
        setReconnecting(false);
        onReconnectSuccess(res.data.device);
      })
      .catch((err: unknown) => {
        setReconnecting(false);
        setActionError(
          err instanceof Error ? err.message : "Reconnect failed. Please try again.",
        );
      });
  }

  function handleDisconnect() {
    setDisconnecting(true);
    setActionError(null);

    apiFetch<null>(`/devices/${device.id}`, { method: "DELETE" })
      .then(() => {
        setDisconnecting(false);
        onDisconnectSuccess(device.id);
      })
      .catch((err: unknown) => {
        setDisconnecting(false);
        setActionError(
          err instanceof Error ? err.message : "Disconnect failed. Please try again.",
        );
      });
  }

  const isSynced = device.status === "connected";
  const isStaleOrFailed = device.status === "pending" || device.status === "error" || device.status === "disconnected";

  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <span aria-hidden="true" className={styles.deviceIcon}>
          {deviceIcon(device.deviceType)}
        </span>
        <div className={styles.cardTitleGroup}>
          <h2 className={styles.deviceName}>{device.deviceName || device.provider}</h2>
          <span className={styles.typeBadge}>{deviceTypeLabel(device.deviceType)}</span>
        </div>
        <span
          className={
            device.status === "connected"
              ? styles.statusSynced
              : device.status === "pending"
                ? styles.statusWarning
                : styles.statusError
          }
        >
          {statusBadge(device.status)}
        </span>
      </div>

      <dl className={styles.metaList}>
        <div className={styles.metaRow}>
          <dt>Last Sync</dt>
          <dd>{device.lastSyncAt ? formatDateTime(device.lastSyncAt) : "Unknown"}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Battery</dt>
          <dd>{device.batteryLevel ?? "Unknown"}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Connected Since</dt>
          <dd>{formatDate(device.connectedSince)}</dd>
        </div>
      </dl>

      {actionError && (
        <p role="alert" className={styles.syncError}>
          {actionError}
        </p>
      )}

      <div className={styles.cardActions}>
        {isSynced && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleSyncNow}
            disabled={syncing}
            aria-busy={syncing}
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        )}
        {isStaleOrFailed && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleReconnect}
            disabled={reconnecting}
            aria-busy={reconnecting}
          >
            {reconnecting ? "Reconnecting…" : "Reconnect"}
          </button>
        )}
        <button
          type="button"
          className={styles.btnDanger}
          onClick={handleDisconnect}
          disabled={disconnecting}
          aria-busy={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </li>
  );
}

export function ConnectedDevicesPage() {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiFetch<GetConnectionsResponse>("/devices/connections", {
      signal: controller.signal,
    })
      .then((res) => {
        const devs = Array.isArray(res?.data?.devices) ? res.data.devices : [];
        setDevices(devs);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load connected devices.",
        );
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className={styles.pageContent}>
      <main className={styles.main}>
        <h1 className={styles.pageHeading}>Connected Devices</h1>
        <p className={styles.pageSubheading}>
          Manage your smartwatch and smart scale connections
        </p>

        {loading && (
          <p role="status" className={styles.statusMessage}>
            Loading connected devices…
          </p>
        )}

        {!loading && error && (
          <section aria-labelledby="error-heading" className={styles.errorSection}>
            <h2 id="error-heading" className={styles.errorHeading}>
              Failed to load devices
            </h2>
            <p>{error}</p>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setLoading(true);
                setError(null);
                apiFetch<GetConnectionsResponse>("/devices/connections")
                  .then((res) => {
                    setDevices(
                      Array.isArray(res?.data?.devices) ? res.data.devices : [],
                    );
                    setLoading(false);
                  })
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to load connected devices.",
                    );
                    setLoading(false);
                  });
              }}
            >
              Retry
            </button>
          </section>
        )}

        {!loading && !error && (
          <ul className={styles.deviceList} aria-label="Connected devices">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onSyncSuccess={(deviceId, syncedAt) => {
                  setDevices((prev) =>
                    prev.map((d) =>
                      d.id === deviceId
                        ? { ...d, lastSyncAt: syncedAt, status: "connected" }
                        : d,
                    ),
                  );
                }}
                onReconnectSuccess={(updated) => {
                  setDevices((prev) =>
                    prev.map((d) => (d.id === updated.id ? updated : d)),
                  );
                }}
                onDisconnectSuccess={(deviceId) => {
                  setDevices((prev) => prev.filter((d) => d.id !== deviceId));
                }}
              />
            ))}
          </ul>
        )}

        <section aria-labelledby="add-device-heading" className={styles.addDeviceSection}>
          <span aria-hidden="true" className={styles.addIcon}>+</span>
          <h2 id="add-device-heading" className={styles.addDeviceHeading}>
            Add Another Device
          </h2>
          <p className={styles.addDeviceDesc}>
            Connect more smartwatches or smart scales to track additional health metrics
          </p>
          <Link to="/devices/pair" className={styles.btnPrimary}>
            Add Device
          </Link>
        </section>
      </main>
    </div>
  );
}

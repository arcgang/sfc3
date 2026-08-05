import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

interface DeviceCardProps {
  device: DeviceDto;
}

function DeviceCard({ device }: DeviceCardProps) {
  const navigate = useNavigate();

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

      <div className={styles.cardActions}>
        {device.status === "connected" ? (
          <button type="button" className={styles.btnSecondary}>
            Sync Now
          </button>
        ) : (
          <button type="button" className={styles.btnSecondary}>
            Reconnect
          </button>
        )}
        <button
          type="button"
          className={styles.btnDanger}
          onClick={() => navigate("/devices/pair")}
        >
          Disconnect
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
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <nav aria-label="Sidebar navigation" className={styles.sidebarNav}>
          <Link to="/dashboard" className={styles.navLink}>📊 Dashboard</Link>
          <Link to="/my-account" className={styles.navLink}>👤 My Account</Link>
          <Link to="/partners-services" className={styles.navLink}>🤝 Partners &amp; Services</Link>
          <span className={styles.userName}>Alex Johnson</span>
          <span className={styles.userEmail}>alex@example.com</span>
          <Link to="/logout" className={styles.navLink}>Log out</Link>
        </nav>
      </aside>

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
              <DeviceCard key={device.id} device={device} />
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

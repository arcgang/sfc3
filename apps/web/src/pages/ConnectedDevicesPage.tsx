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

<<<<<<< HEAD
interface ApiResponse {
=======
interface GetConnectionsResponse {
>>>>>>> origin/main
  data: {
    devices: DeviceDto[];
  };
}

<<<<<<< HEAD
function typeBadgeLabel(deviceType: string): string {
  return deviceType === "smart_scale" ? "Smart Scale" : "Smartwatch";
}

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatLastSync(iso: string | null): string {
  if (!iso) return "Unknown";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Less than 1 hour ago";
  if (diffH === 1) return "1 hour ago";
  if (diffH < 24) return `${diffH} hours ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1 day ago";
  return `${diffD} days ago`;
}

export function ConnectedDevicesPage() {
  const navigate = useNavigate();
=======
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
>>>>>>> origin/main
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
<<<<<<< HEAD

    apiFetch<ApiResponse>("/devices/connections", { signal: controller.signal })
      .then((res) => {
        const list = Array.isArray(res?.data?.devices) ? res.data.devices : [];
        setDevices(list);
=======
    setLoading(true);
    setError(null);

    apiFetch<GetConnectionsResponse>("/devices/connections", {
      signal: controller.signal,
    })
      .then((res) => {
        const devs = Array.isArray(res?.data?.devices) ? res.data.devices : [];
        setDevices(devs);
>>>>>>> origin/main
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
<<<<<<< HEAD
        setError("Failed to load connected devices. Please try again.");
        setLoading(false);
      });

    return () => controller.abort();
=======
        setError(
          err instanceof Error ? err.message : "Failed to load connected devices.",
        );
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
>>>>>>> origin/main
  }, []);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
<<<<<<< HEAD
        <div className={styles.brand}>
          <span aria-hidden="true">W</span>
          <strong>WellnessHub</strong>
        </div>
        <nav aria-label="Sidebar navigation" className={styles.nav}>
          <Link to="/dashboard" className={styles.navLink}>📊 Dashboard</Link>
          <Link to="/my-account" className={styles.navLink}>👤 My Account</Link>
          <Link to="/partners-services" className={styles.navLink}>🤝 Partners &amp; Services</Link>
        </nav>
        <div className={styles.userBlock}>
          <span aria-hidden="true" className={styles.userAvatar}>A</span>
          <span className={styles.userName}>Alex Johnson</span>
          <span className={styles.userEmail}>alex@example.com</span>
          <Link to="/logout" className={styles.logoutLink}>Log out</Link>
        </div>
      </aside>

      <main className={styles.main}>
        <h1>Connected Devices</h1>
        <p className={styles.subtitle}>Manage your smartwatch and smart scale connections</p>

        {loading && (
          <p role="status" className={styles.loadingMessage}>Loading connected devices…</p>
        )}

        {error && !loading && (
          <p role="alert" className={styles.errorMessage}>
            {error}{" "}
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                setError(null);
                setLoading(true);
                apiFetch<ApiResponse>("/devices/connections")
                  .then((res) => {
                    const list = Array.isArray(res?.data?.devices) ? res.data.devices : [];
                    setDevices(list);
                    setLoading(false);
                  })
                  .catch(() => {
                    setError("Failed to load connected devices. Please try again.");
=======
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
>>>>>>> origin/main
                    setLoading(false);
                  });
              }}
            >
              Retry
            </button>
<<<<<<< HEAD
          </p>
        )}

        {!loading && !error && devices.length === 0 && (
          <p className={styles.emptyState}>
            No devices connected yet.{" "}
            <Link to="/devices/pair">Add your first device</Link>.
          </p>
        )}

        {!loading && !error && devices.length > 0 && (
          <ul className={styles.deviceList}>
            {devices.map((device) => (
              <li key={device.id} className={styles.deviceCard}>
                <div className={styles.deviceCardHeader}>
                  <span aria-hidden="true" className={styles.deviceCardEmoji}>
                    {device.deviceType === "smart_scale" ? "⚖️" : "⌚"}
                  </span>
                  <div className={styles.deviceInfo}>
                    <h3 className={styles.deviceName}>{device.deviceName}</h3>
                    <span className={styles.typeBadge}>{typeBadgeLabel(device.deviceType)}</span>
                  </div>
                  <span className={`${styles.statusBadge} ${styles[`status_${device.status}`] ?? ""}`}>
                    {device.status === "connected" ? "✓ Synced" :
                      device.status === "disconnected" ? "✗ Disconnected" : "⚠ Stale Data"}
                  </span>
                </div>
                <dl className={styles.deviceMeta}>
                  <dt>Last Sync</dt>
                  <dd>{formatLastSync(device.lastSyncAt)}</dd>
                  <dt>Battery</dt>
                  <dd>{device.batteryLevel ?? "Unknown"}</dd>
                  <dt>Connected Since</dt>
                  <dd>{formatDate(device.connectedSince)}</dd>
                </dl>
                <div className={styles.deviceActions}>
                  <button type="button" className={styles.actionButton}>Sync Now</button>
                  <button type="button" className={styles.actionButtonSecondary}>Disconnect</button>
                </div>
              </li>
=======
          </section>
        )}

        {!loading && !error && (
          <ul className={styles.deviceList} aria-label="Connected devices">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
>>>>>>> origin/main
            ))}
          </ul>
        )}

        <section aria-labelledby="add-device-heading" className={styles.addDeviceSection}>
<<<<<<< HEAD
          <span aria-hidden="true" className={styles.addDeviceIcon}>+</span>
          <h3 id="add-device-heading">Add Another Device</h3>
          <p>Connect more smartwatches or smart scales to track additional health metrics</p>
          <button
            type="button"
            className={styles.addDeviceButton}
            onClick={() => navigate("/devices/pair")}
          >
            Add Device
          </button>
=======
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
>>>>>>> origin/main
        </section>
      </main>
    </div>
  );
}

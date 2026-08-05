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

interface ApiResponse {
  data: {
    devices: DeviceDto[];
  };
}

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
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<ApiResponse>("/devices/connections", { signal: controller.signal })
      .then((res) => {
        const list = Array.isArray(res?.data?.devices) ? res.data.devices : [];
        setDevices(list);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Failed to load connected devices. Please try again.");
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
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
                    setLoading(false);
                  });
              }}
            >
              Retry
            </button>
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
            ))}
          </ul>
        )}

        <section aria-labelledby="add-device-heading" className={styles.addDeviceSection}>
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
        </section>
      </main>
    </div>
  );
}

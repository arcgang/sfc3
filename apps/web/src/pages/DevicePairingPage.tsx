import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./DevicePairingPage.module.css";

interface Provider {
  id: string;
  label: string;
  emoji: string;
}

const PROVIDERS: Provider[] = [
  { id: "fitbit", label: "Fitbit", emoji: "📱" },
  { id: "apple-watch", label: "Apple Watch", emoji: "🍎" },
  { id: "garmin", label: "Garmin", emoji: "🏃" },
  { id: "withings", label: "Withings", emoji: "⚡" },
];

const CONNECTION_STEPS = [
  "Click \"Authorize\" to grant WellnessHub access to your device data",
  "Log in to your device provider account when prompted",
  "Review and accept the permissions requested",
  "Wait for the connection to complete",
];

interface DeviceConnectResponse {
  data: {
    device: {
      status: string;
      lastSyncAt: string | null;
    };
  };
}

export function DevicePairingPage() {
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<"success" | "failure" | null>(null);

  async function handleConnect(provider: Provider) {
    setConnectingProvider(provider.id);
    setConnectionResult(null);
    try {
      await apiFetch<DeviceConnectResponse>("/devices/connections", {
        method: "PUT",
        body: JSON.stringify({
          deviceType: "smartwatch",
          action: "connect",
          provider: provider.label,
          deviceName: provider.label,
        }),
      });
      setConnectionResult("success");
    } catch {
      setConnectionResult("failure");
    } finally {
      setConnectingProvider(null);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.logo} aria-hidden="true">
          <div className={styles.logoIcon}>W</div>
          <span className={styles.logoText}>WellnessHub</span>
        </div>

        <h1 className={styles.heading}>Connect Your Devices</h1>
        <p className={styles.subheading}>
          Connect your smartwatch and smart scale to start tracking your wellness data
        </p>

        <div className={styles.progressBar} role="presentation">
          <div className={styles.progressFill} />
        </div>

        <section aria-labelledby="device-types-heading" className={styles.deviceTypesSection}>
          <h2 id="device-types-heading" className="sr-only">Device Types</h2>
          <ul className={styles.deviceTypeList}>
            <li className={styles.deviceTypeCard}>
              <span aria-hidden="true" className={styles.deviceIconCircle}>⌚</span>
              <h3 className={styles.deviceTypeName}>Smartwatch</h3>
              <p className={styles.deviceTypeDesc}>
                Track activity, heart rate, sleep, and more from your wearable device
              </p>
              <button type="button" className={styles.connectTypeBtn}>
                Connect Smartwatch
              </button>
            </li>
            <li className={styles.deviceTypeCard}>
              <span aria-hidden="true" className={styles.deviceIconCircle}>⚖️</span>
              <h3 className={styles.deviceTypeName}>Smart Scale</h3>
              <p className={styles.deviceTypeDesc}>
                Monitor weight, body fat, muscle mass, and body composition metrics
              </p>
              <button type="button" className={styles.connectTypeBtn}>
                Connect Smart Scale
              </button>
            </li>
          </ul>
        </section>

        <section aria-labelledby="provider-heading" className={styles.providerSection}>
          <h2 id="provider-heading" className={styles.providerHeading}>
            Select Your Device Provider
          </h2>
          <ul className={styles.providerList}>
            {PROVIDERS.map((provider) => (
              <li key={provider.id} className={styles.providerCard}>
                <div className={styles.providerInfo}>
                  <span aria-hidden="true" className={styles.providerLogo}>{provider.emoji}</span>
                  <h3 className={styles.providerLabel}>{provider.label}</h3>
                </div>
                <button
                  type="button"
                  className={styles.connectBtn}
                  disabled={connectingProvider !== null}
                  onClick={() => { void handleConnect(provider); }}
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>

          {connectionResult === "success" && (
            <p role="status" className={styles.successMsg}>
              ✓ Device connected successfully!
            </p>
          )}
          {connectionResult === "failure" && (
            <p role="alert" className={styles.failureMsg}>
              ✗ Connection failed. Please try again.
            </p>
          )}
        </section>

        <section aria-labelledby="steps-heading" className={styles.stepsSection}>
          <h2 id="steps-heading" className={styles.stepsHeading}>Connection Steps</h2>
          <ol className={styles.stepsList}>
            {CONNECTION_STEPS.map((step) => (
              <li key={step} className={styles.step}>{step}</li>
            ))}
          </ol>
        </section>

        <nav aria-label="Pairing navigation" className={styles.pairingNav}>
          <Link to="/" className={styles.skipLink}>Skip for now</Link>
          <Link to="/" className={styles.continueLink}>Continue to Dashboard</Link>
        </nav>
      </main>
    </div>
  );
}

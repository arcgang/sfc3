import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./DevicePairingPage.module.css";

type PairingState = "idle" | "loading" | "success" | "error";

interface Provider {
  id: string;
  name: string;
  emoji: string;
  deviceType: "smartwatch" | "smart_scale";
  deviceName: string;
}

const PROVIDERS: Provider[] = [
  { id: "fitbit", name: "Fitbit", emoji: "📱", deviceType: "smartwatch", deviceName: "Fitbit Charge 5" },
  { id: "apple-watch", name: "Apple Watch", emoji: "🍎", deviceType: "smartwatch", deviceName: "Apple Watch Series 8" },
  { id: "garmin", name: "Garmin", emoji: "🏃", deviceType: "smartwatch", deviceName: "Garmin Watch" },
  { id: "withings", name: "Withings", emoji: "⚡", deviceType: "smart_scale", deviceName: "Withings Body+" },
];

export function DevicePairingPage() {
  const navigate = useNavigate();
  const [pairingState, setPairingState] = useState<PairingState>("idle");
  const [connectingId, setConnectingId] = useState<string | null>(null);

  async function handleConnect(provider: Provider) {
    setConnectingId(provider.id);
    setPairingState("loading");
    try {
      await apiFetch("/devices/connections", {
        method: "PUT",
        body: JSON.stringify({
          action: "connect",
          deviceType: provider.deviceType,
          provider: provider.name,
          deviceName: provider.deviceName,
        }),
      });
      setPairingState("success");
    } catch {
      setPairingState("error");
    } finally {
      setConnectingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.brand}>
          <span aria-hidden="true">W</span>
          <strong>WellnessHub</strong>
        </div>
      </header>

      <main className={styles.main}>
        <h1>Connect Your Devices</h1>
        <p className={styles.subtitle}>
          Connect your smartwatch and smart scale to start tracking your wellness data
        </p>

        <section aria-labelledby="device-types-heading" className={styles.deviceTypes}>
          <h2 id="device-types-heading" className="sr-only">Device Types</h2>
          <div className={styles.deviceTypeGrid}>
            <div className={styles.deviceTypeCard}>
              <span aria-hidden="true" className={styles.deviceEmoji}>⌚</span>
              <h3>Smartwatch</h3>
              <p>Track activity, heart rate, sleep, and more from your wearable device</p>
              <button type="button" className={styles.deviceTypeButton}>
                Connect Smartwatch
              </button>
            </div>
            <div className={styles.deviceTypeCard}>
              <span aria-hidden="true" className={styles.deviceEmoji}>⚖️</span>
              <h3>Smart Scale</h3>
              <p>Monitor weight, body fat, muscle mass, and body composition metrics</p>
              <button type="button" className={styles.deviceTypeButton}>
                Connect Smart Scale
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="provider-heading" className={styles.providerSection}>
          <h2 id="provider-heading">Select Your Device Provider</h2>
          <ul className={styles.providerGrid}>
            {PROVIDERS.map((provider) => (
              <li key={provider.id} className={styles.providerCard}>
                <span aria-hidden="true" className={styles.providerEmoji}>{provider.emoji}</span>
                <span className={styles.providerName}>{provider.name}</span>
                <button
                  type="button"
                  className={styles.connectButton}
                  onClick={() => handleConnect(provider)}
                  disabled={pairingState === "loading" && connectingId === provider.id}
                  aria-label={`Connect ${provider.name}`}
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="steps-heading" className={styles.stepsSection}>
          <h3 id="steps-heading">Connection Steps</h3>
          <ol className={styles.stepsList}>
            <li>Click &quot;Authorize&quot; to grant WellnessHub access to your device data</li>
            <li>Log in to your device provider account when prompted</li>
            <li>Review and accept the permissions requested</li>
            <li>Wait for the connection to complete</li>
          </ol>
        </section>

        {pairingState === "success" && (
          <p role="status" className={styles.successMessage}>
            ✓ Device connected successfully!
          </p>
        )}
        {pairingState === "error" && (
          <p role="alert" className={styles.errorMessage}>
            ✗ Connection failed. Please try again.
          </p>
        )}

        <div className={styles.actions}>
          <Link to="/dashboard" className={styles.skipLink}>
            Skip for now
          </Link>
          <button
            type="button"
            className={styles.continueButton}
            onClick={() => navigate("/dashboard")}
          >
            Continue to Dashboard
          </button>
        </div>
      </main>
    </div>
  );
}

import { useState } from "react";
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/main
    }
  }

  return (
    <div className={styles.page}>
<<<<<<< HEAD
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
=======
      <main className={styles.main}>
        <h1 className={styles.heading}>Connect Your Devices</h1>
        <p className={styles.subheading}>
          Connect your smartwatch and smart scale to start tracking your wellness data
        </p>

        <section aria-labelledby="device-types-heading" className={styles.deviceTypesSection}>
          <h2 id="device-types-heading" className="sr-only">Device Types</h2>
          <ul className={styles.deviceTypeList}>
            <li className={styles.deviceTypeCard}>
              <span aria-hidden="true" className={styles.deviceEmoji}>⌚</span>
              <h3 className={styles.deviceTypeName}>Smartwatch</h3>
              <p className={styles.deviceTypeDesc}>
                Track activity, heart rate, sleep, and more from your wearable device
              </p>
              <button type="button" className={styles.connectTypeBtn}>
                Connect Smartwatch
              </button>
            </li>
            <li className={styles.deviceTypeCard}>
              <span aria-hidden="true" className={styles.deviceEmoji}>⚖️</span>
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
                <span aria-hidden="true" className={styles.providerEmoji}>{provider.emoji}</span>
                <h3 className={styles.providerLabel}>{provider.label}</h3>
                <button
                  type="button"
                  className={styles.connectBtn}
                  disabled={connectingProvider !== null}
                  onClick={() => { void handleConnect(provider); }}
>>>>>>> origin/main
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
<<<<<<< HEAD
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
=======

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
>>>>>>> origin/main
      </main>
    </div>
  );
}

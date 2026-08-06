import { useState, useEffect } from "react";
import { apiFetch } from "../api.js";
import styles from "./MyAccountPage.module.css";

type PersonaMode = "default" | "fitness" | "elder_friendly" | "chronic_care_aware";

interface Profile {
  fullName: string;
  personaMode: PersonaMode;
}

interface ProfileResponse {
  data: { profile: Profile | null };
}

const DASHBOARD_MODES: { value: PersonaMode; title: string; desc: string }[] = [
  {
    value: "default",
    title: "Everyday Wellness",
    desc: "Balanced view across all health domains. Best for general wellness tracking and daily health monitoring.",
  },
  {
    value: "fitness",
    title: "Active Fitness",
    desc: "Emphasizes activity, workouts, recovery, and body composition. Ideal for fitness enthusiasts and athletes.",
  },
  {
    value: "chronic_care_aware",
    title: "Assisted / Chronic-Care-Aware",
    desc: "Larger emphasis on critical indicators, simplified readability, and clear alerts. Designed for easier monitoring.",
  },
];

export function MyAccountPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("Alex Johnson");
  const [personaMode, setPersonaMode] = useState<PersonaMode>("default");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await apiFetch<ProfileResponse>("/profile");
        if (cancelled) return;
        const profile = res.data.profile;
        if (profile) {
          setFullName(profile.fullName);
          setPersonaMode(profile.personaMode ?? "default");
        }
      } catch {
        if (!cancelled) setLoadError("Could not load your profile. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  async function handleSaveMode(mode: PersonaMode) {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify({ fullName, personaMode: mode }),
      });
      setPersonaMode(mode);
      setSaveSuccess(true);
    } catch {
      setSaveError("Could not save your Dashboard Mode. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>My Account</h1>
      <p className={styles.pageSubtitle}>Manage your profile, preferences, and privacy settings</p>

      {loading ? (
        <p className={styles.loadingState}>Loading your account…</p>
      ) : loadError ? (
        <p role="alert" className={styles.errorState}>
          {loadError}{" "}
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </p>
      ) : (
        <>
          <section aria-labelledby="profile-heading" className={styles.section}>
            <h2 id="profile-heading" className={styles.sectionHeading}>Profile</h2>
            <div className={styles.profileCard}>
              <div className={styles.profileAvatar} aria-hidden="true">A</div>
              <div className={styles.profileInfo}>
                <p className={styles.profileName}>{fullName}</p>
                <p className={styles.profileEmail}>alex@example.com</p>
              </div>
              <button type="button" className={styles.editButton}>Edit Profile</button>
            </div>
            <dl className={styles.profileDetails}>
              <div className={styles.profileField}>
                <dt>Full Name</dt>
                <dd>{fullName}</dd>
              </div>
              <div className={styles.profileField}>
                <dt>Email Address</dt>
                <dd>alex@example.com (verified)</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="dashboard-mode-heading" className={styles.section}>
            <h2 id="dashboard-mode-heading" className={styles.sectionHeading}>Dashboard Mode</h2>
            <p className={styles.sectionDesc}>Choose how your dashboard emphasizes health information</p>

            {saveSuccess && (
              <p role="status" className={styles.successMessage}>
                Dashboard Mode saved.
              </p>
            )}
            {saveError && (
              <p role="alert" className={styles.errorMessage}>
                {saveError}
              </p>
            )}

            <div
              className={styles.modeOptions}
              role="radiogroup"
              aria-label="Dashboard Mode"
            >
              {DASHBOARD_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`${styles.modeOption} ${personaMode === mode.value ? styles.modeOptionSelected : ""}`}
                >
                  <input
                    type="radio"
                    name="dashboardMode"
                    value={mode.value}
                    checked={personaMode === mode.value}
                    disabled={saving}
                    onChange={() => void handleSaveMode(mode.value)}
                  />
                  <div>
                    <span className={styles.modeOptionTitle}>{mode.title}</span>
                    <p className={styles.modeOptionDesc}>{mode.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section aria-labelledby="wellness-prefs-heading" className={styles.section}>
            <h2 id="wellness-prefs-heading" className={styles.sectionHeading}>Wellness Preferences</h2>
            <div className={styles.prefRow}>
              <div>
                <p className={styles.prefLabel}>Goal Preferences</p>
                <p className={styles.prefDesc}>Daily step goals, weekly activity targets</p>
              </div>
            </div>
            <div className={styles.prefRow}>
              <div>
                <p className={styles.prefLabel}>Notification Preferences</p>
                <p className={styles.prefDesc}>Email alerts for stale data and goal milestones</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="privacy-heading" className={styles.section}>
            <h2 id="privacy-heading" className={styles.sectionHeading}>Privacy &amp; Data Settings</h2>
            <p className={styles.sectionDesc}>You own your health data. You can export or delete it anytime.</p>
            <p className={styles.privacyText}>
              Your wellness data is encrypted, secure, and never sold to third parties. We are committed to protecting your privacy and giving you full control over your information.
            </p>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.secondaryButton}>Export My Data</button>
              <button type="button" className={styles.dangerButton}>Delete My Account</button>
            </div>
          </section>

          <section aria-labelledby="security-heading" className={styles.section}>
            <h2 id="security-heading" className={styles.sectionHeading}>Security</h2>
            <div className={styles.securityRow}>
              <span>Password</span>
              <a href="/change-password" className={styles.securityLink}>Change Password</a>
            </div>
            <div className={styles.securityRow}>
              <span>Active Sessions</span>
              <a href="/sessions" className={styles.securityLink}>View Sessions</a>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { apiFetch } from "../api.js";
import styles from "./MyAccountPage.module.css";

type PersonaMode = "default" | "fitness" | "elder_friendly" | "chronic_care_aware";

interface Profile {
  id: string;
  userId: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  wellnessPreferences: string[];
  personaMode: string;
  privacy: {
    policyAccepted: boolean;
    dataExportRequested: boolean;
    dataDeletionRequested: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface ProfileResponse {
  data: {
    email: string | null;
    profile: Profile | null;
  };
}

interface PutProfileBody {
  fullName: string;
  personaMode?: PersonaMode;
  dateOfBirth?: string | null;
  gender?: string | null;
  wellnessPreferences?: string[];
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

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "U";
}

export function MyAccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameFormError, setNameFormError] = useState<string | null>(null);

  const [personaMode, setPersonaMode] = useState<PersonaMode>("default");
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [personaSaved, setPersonaSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<ProfileResponse>("/profile", { signal: controller.signal })
      .then((res) => {
        setEmail(res.data.email);
        setProfile(res.data.profile);
        if (res.data.profile) {
          const mode = res.data.profile.personaMode as PersonaMode;
          setPersonaMode(
            (["default", "fitness", "chronic_care_aware", "elder_friendly"] as const).includes(
              mode as "default" | "fitness" | "chronic_care_aware" | "elder_friendly",
            )
              ? mode
              : "default",
          );
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setLoadError("Failed to load profile. Please try again.");
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  function startEditName() {
    setNameInput(profile?.fullName ?? "");
    setNameError(null);
    setNameFormError(null);
    setEditingName(true);
  }

  function cancelEditName() {
    setEditingName(false);
    setNameError(null);
    setNameFormError(null);
  }

  async function handleNameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameError(null);
    setNameFormError(null);

    const trimmed = nameInput.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setNameError("Full name must be between 2 and 120 characters.");
      return;
    }

    setNameSaving(true);
    try {
      const body: PutProfileBody = {
        fullName: trimmed,
        personaMode,
        dateOfBirth: profile?.dateOfBirth ?? null,
        gender: profile?.gender ?? null,
        wellnessPreferences: profile?.wellnessPreferences ?? [],
      };
      const res = await apiFetch<{ data: { profile: Profile } }>("/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setProfile(res.data.profile);
      setEditingName(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as {
            error: { details: Array<{ path?: string[]; message: string }> };
          };
          const fullNameDetail = parsed.error.details.find(
            (d) => d.path?.[0] === "fullName" || d.message.toLowerCase().includes("name"),
          );
          if (fullNameDetail) {
            setNameError(fullNameDetail.message);
          } else {
            setNameFormError("Could not save name. Please try again.");
          }
        } catch {
          setNameFormError("Could not save name. Please try again.");
        }
      } else {
        setNameFormError("Could not save name. Please try again.");
      }
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePersonaSave() {
    setPersonaError(null);
    setPersonaSaved(false);
    setPersonaSaving(true);
    try {
      const body: PutProfileBody = {
        fullName: profile?.fullName ?? "User",
        personaMode,
        dateOfBirth: profile?.dateOfBirth ?? null,
        gender: profile?.gender ?? null,
        wellnessPreferences: profile?.wellnessPreferences ?? [],
      };
      const res = await apiFetch<{ data: { profile: Profile } }>("/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setProfile(res.data.profile);
      setPersonaSaved(true);
    } catch {
      setPersonaError("Could not save dashboard mode. Please try again.");
    } finally {
      setPersonaSaving(false);
    }
  }

  const displayName = profile?.fullName ?? "User";
  const displayEmail = email ?? "";
  const displayInitial = initials(displayName);

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>My Account</h1>
      <p className={styles.pageSubtitle}>
        Manage your profile, preferences, and privacy settings
      </p>

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
          {/* ── Profile section ── */}
          <section aria-labelledby="profile-section-heading" className={styles.section}>
            <h2 id="profile-section-heading" className={styles.sectionTitle}>Profile</h2>

            <div className={styles.profileHeader}>
              <span aria-hidden="true" className={styles.avatar}>{displayInitial}</span>
              <div>
                <div className={styles.profileName}>{displayName}</div>
                <div className={styles.profileEmail}>{displayEmail}</div>
              </div>
              {!editingName && (
                <button type="button" className={styles.editButton} onClick={startEditName}>
                  Edit Profile
                </button>
              )}
            </div>

            {!editingName ? (
              <dl className={styles.profileFields}>
                <div className={styles.profileField}>
                  <dt>Full Name</dt>
                  <dd>{displayName}</dd>
                </div>
                <div className={styles.profileField}>
                  <dt>Email Address</dt>
                  <dd>
                    {displayEmail}{" "}
                    <span className={styles.verifiedBadge}>(verified)</span>
                  </dd>
                </div>
              </dl>
            ) : (
              <div className={styles.editFormWrapper}>
                {nameFormError && (
                  <p role="alert" className={styles.formError}>
                    {nameFormError}
                  </p>
                )}
                <form
                  onSubmit={handleNameSubmit}
                  aria-label="Edit profile form"
                  className={styles.editForm}
                  noValidate
                >
                  <div className={styles.field}>
                    <label htmlFor="fullName">Full Name</label>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      aria-describedby={nameError ? "fullName-error" : undefined}
                      minLength={2}
                      maxLength={120}
                      required
                    />
                    {nameError && (
                      <span id="fullName-error" role="alert" className={styles.fieldError}>
                        {nameError}
                      </span>
                    )}
                  </div>
                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className={styles.saveButton}
                      disabled={nameSaving}
                    >
                      {nameSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={cancelEditName}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* ── Dashboard Mode section ── */}
          <section aria-labelledby="dashboard-mode-heading" className={styles.section}>
            <h2 id="dashboard-mode-heading" className={styles.sectionTitle}>Dashboard Mode</h2>
            <p className={styles.sectionDesc}>
              Choose how your dashboard emphasizes health information
            </p>

            {personaError && (
              <p role="alert" className={styles.formError}>
                {personaError}
              </p>
            )}
            {personaSaved && (
              <p role="status" className={styles.successMessage}>
                Dashboard mode saved.
              </p>
            )}

            <div className={styles.modeOptions} role="radiogroup" aria-label="Dashboard Mode">
              {DASHBOARD_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={
                    personaMode === mode.value
                      ? `${styles.modeOption} ${styles.modeOptionSelected}`
                      : styles.modeOption
                  }
                >
                  <input
                    type="radio"
                    name="personaMode"
                    value={mode.value}
                    checked={personaMode === mode.value}
                    onChange={() => {
                      setPersonaMode(mode.value);
                      setPersonaSaved(false);
                    }}
                  />
                  <div>
                    <span className={styles.modeOptionTitle}>{mode.title}</span>
                    <p className={styles.modeOptionDesc}>{mode.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <button
              type="button"
              className={styles.saveButton}
              onClick={handlePersonaSave}
              disabled={personaSaving}
            >
              {personaSaving ? "Saving…" : "Save Dashboard Mode"}
            </button>
          </section>

          {/* ── Wellness Preferences section ── */}
          <section aria-labelledby="wellness-prefs-heading" className={styles.section}>
            <h2 id="wellness-prefs-heading" className={styles.sectionTitle}>Wellness Preferences</h2>
            <div className={styles.prefsList}>
              <div className={styles.prefItem}>
                <span className={styles.prefLabel}>Goal Preferences</span>
                <span className={styles.prefDesc}>Daily step goals, weekly activity targets</span>
              </div>
              <div className={styles.prefItem}>
                <span className={styles.prefLabel}>Notification Preferences</span>
                <span className={styles.prefDesc}>Email alerts for stale data and goal milestones</span>
              </div>
            </div>
          </section>

          {/* ── Privacy & Data section ── */}
          <section aria-labelledby="privacy-section-heading" className={styles.section}>
            <h2 id="privacy-section-heading" className={styles.sectionTitle}>
              Privacy &amp; Data Settings
            </h2>
            <p className={styles.privacyNote}>
              You own your health data. You can export or delete it anytime.
            </p>
            <p className={styles.sectionDesc}>
              Your wellness data is encrypted, secure, and never sold to third parties. We are
              committed to protecting your privacy and giving you full control over your
              information.
            </p>
            <div className={styles.privacyActions}>
              <button type="button" className={styles.secondaryButton}>
                Export My Data
              </button>
              <button type="button" className={styles.dangerButton}>
                Delete My Account
              </button>
            </div>
          </section>

          {/* ── Security section ── */}
          <section aria-labelledby="security-section-heading" className={styles.section}>
            <h2 id="security-section-heading" className={styles.sectionTitle}>Security</h2>
            <dl className={styles.securityList}>
              <div className={styles.securityItem}>
                <dt>Password</dt>
                <dd>
                  <a
                    href="#change-password-noop"
                    onClick={(e) => e.preventDefault()}
                  >
                    Change Password
                  </a>
                </dd>
              </div>
              <div className={styles.securityItem}>
                <dt>Active Sessions</dt>
                <dd>
                  <a
                    href="#view-sessions-noop"
                    onClick={(e) => e.preventDefault()}
                  >
                    View Sessions
                  </a>
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

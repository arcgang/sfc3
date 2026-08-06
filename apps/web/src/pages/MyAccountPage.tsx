import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./MyAccountPage.module.css";

type PersonaMode = "default" | "fitness" | "elder_friendly" | "chronic_care_aware";

interface Profile {
  fullName: string;
  email?: string;
  emailVerified?: boolean;
  personaMode: PersonaMode;
}

interface ProfileResponse {
  data: { email?: string; profile: Profile | null };
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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("alex@example.com");
  const [personaMode, setPersonaMode] = useState<PersonaMode>("default");

  // Edit profile form state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editServerError, setEditServerError] = useState<string | null>(null);

  // Dashboard mode state
  const [pendingMode, setPendingMode] = useState<PersonaMode>("default");
  const [modeSaving, setModeSaving] = useState(false);
  const [modeSaveError, setModeSaveError] = useState<string | null>(null);
  const [modeSaveSuccess, setModeSaveSuccess] = useState(false);

  // Privacy request state
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await apiFetch<ProfileResponse>("/profile");
        if (cancelled) return;
        const profile = res.data.profile;
        if (res.data.email) setEmail(res.data.email);
        if (profile) {
          setFullName(profile.fullName);
          const mode = profile.personaMode ?? "default";
          setPersonaMode(mode);
          setPendingMode(mode);
        }
      } catch {
        if (!cancelled) setLoadError("Could not load your profile. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<unknown>("/privacy/viewed", { signal: controller.signal }).catch(() => {
      // best-effort — failure does not block the UI
    });
    return () => controller.abort();
  }, []);

  function openEdit() {
    setEditName(fullName);
    setEditNameError(null);
    setEditServerError(null);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditNameError(null);
    setEditServerError(null);
  }

  async function handleEditSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditNameError(null);
    setEditServerError(null);

    const trimmed = editName.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setEditNameError("Full name must be between 2 and 120 characters.");
      return;
    }

    setEditSaving(true);
    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify({ fullName: trimmed, personaMode }),
      });
      setFullName(trimmed);
      setEditOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as {
            error?: { details?: { path: string[]; message: string }[] };
          };
          const details = parsed?.error?.details ?? [];
          const nameErr = details.find((d) => d.path[0] === "fullName");
          if (nameErr) {
            setEditNameError(nameErr.message);
          } else {
            setEditServerError("Could not save your profile. Please try again.");
          }
        } catch {
          setEditServerError("Could not save your profile. Please try again.");
        }
      } else {
        setEditServerError("Could not save your profile. Please try again.");
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSaveMode() {
    setModeSaving(true);
    setModeSaveError(null);
    setModeSaveSuccess(false);
    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify({ fullName, personaMode: pendingMode }),
      });
      setPersonaMode(pendingMode);
      setModeSaveSuccess(true);
    } catch {
      setModeSaveError("Could not save your Dashboard Mode. Please try again.");
    } finally {
      setModeSaving(false);
    }
  }

  async function handleExportData() {
    setExportSubmitting(true);
    setExportMessage(null);
    setExportError(null);
    try {
      const res = await apiFetch<{ data: { message: string } }>("/privacy/requests", {
        method: "POST",
        body: JSON.stringify({ requestType: "export" }),
      });
      setExportMessage(res.data.message);
    } catch {
      setExportError("Could not submit export request. Please try again.");
    } finally {
      setExportSubmitting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteSubmitting(true);
    setDeleteMessage(null);
    setDeleteError(null);
    try {
      const res = await apiFetch<{ data: { message: string } }>("/privacy/requests", {
        method: "POST",
        body: JSON.stringify({ requestType: "delete" }),
      });
      setDeleteMessage(res.data.message);
    } catch {
      setDeleteError("Could not submit deletion request. Please try again.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const avatarInitial = fullName.trim().charAt(0).toUpperCase() || "A";

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
          {/* Profile section */}
          <section aria-labelledby="profile-heading" className={styles.section}>
            <h2 id="profile-heading" className={styles.sectionHeading}>Profile</h2>
            <div className={styles.profileCard}>
              <div className={styles.profileAvatar} aria-hidden="true">{avatarInitial}</div>
              <div className={styles.profileInfo}>
                <p className={styles.profileName}>{fullName}</p>
                <p className={styles.profileEmail}>{email}</p>
              </div>
              <button type="button" className={styles.editButton} onClick={openEdit}>
                Edit Profile
              </button>
            </div>

            {editOpen && (
              <form
                aria-label="Edit profile form"
                className={styles.editForm}
                onSubmit={(e) => void handleEditSave(e)}
                noValidate
              >
                <div className={styles.formField}>
                  <label htmlFor="edit-full-name" className={styles.formLabel}>
                    Full Name
                  </label>
                  <input
                    id="edit-full-name"
                    type="text"
                    className={styles.formInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={editSaving}
                    autoComplete="name"
                  />
                  {editNameError && (
                    <p role="alert" className={styles.fieldError}>{editNameError}</p>
                  )}
                  {editServerError && (
                    <p role="alert" className={styles.fieldError}>{editServerError}</p>
                  )}
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.saveButton} disabled={editSaving}>
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={closeEdit}
                    disabled={editSaving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <dl className={styles.profileDetails}>
              <div className={styles.profileField}>
                <dt>Full Name</dt>
                <dd>{fullName}</dd>
              </div>
              <div className={styles.profileField}>
                <dt>Email Address</dt>
                <dd>
                  {email} <span className={styles.verifiedBadge}>(verified)</span>
                </dd>
              </div>
            </dl>
          </section>

          {/* Dashboard Mode section */}
          <section aria-labelledby="dashboard-mode-heading" className={styles.section}>
            <h2 id="dashboard-mode-heading" className={styles.sectionHeading}>Dashboard Mode</h2>
            <p className={styles.sectionDesc}>Choose how your dashboard emphasizes health information</p>

            {modeSaveSuccess && (
              <p role="status" className={styles.successMessage}>Dashboard Mode saved.</p>
            )}
            {modeSaveError && (
              <p role="alert" className={styles.errorMessage}>{modeSaveError}</p>
            )}

            <div className={styles.modeOptions} role="radiogroup" aria-label="Dashboard Mode">
              {DASHBOARD_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`${styles.modeOption} ${pendingMode === mode.value ? styles.modeOptionSelected : ""}`}
                >
                  <input
                    type="radio"
                    name="dashboardMode"
                    value={mode.value}
                    checked={pendingMode === mode.value}
                    disabled={modeSaving}
                    onChange={() => setPendingMode(mode.value)}
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
              className={styles.primaryButton}
              onClick={() => void handleSaveMode()}
              disabled={modeSaving}
            >
              {modeSaving ? "Saving…" : "Save Dashboard Mode"}
            </button>
          </section>

          {/* Wellness Preferences section */}
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

          {/* Privacy & Data Settings section */}
          <section aria-labelledby="privacy-heading" className={styles.section}>
            <h2 id="privacy-heading" className={styles.sectionHeading}>Privacy &amp; Data Settings</h2>
            <p className={styles.sectionDesc}>You own your health data. You can export or delete it anytime.</p>
            <p className={styles.privacyText}>
              Your wellness data is encrypted, secure, and never sold to third parties. We are
              committed to protecting your privacy and giving you full control over your information.
            </p>
            <p className={styles.privacyText}>
              <Link to="/privacy" className={styles.securityLink}>View our Privacy Policy</Link>
            </p>

            {exportMessage && (
              <p role="status" className={styles.successMessage}>{exportMessage}</p>
            )}
            {exportError && (
              <p role="alert" className={styles.errorMessage}>{exportError}</p>
            )}
            {deleteMessage && (
              <p role="status" className={styles.successMessage}>{deleteMessage}</p>
            )}
            {deleteError && (
              <p role="alert" className={styles.errorMessage}>{deleteError}</p>
            )}

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void handleExportData()}
                disabled={exportSubmitting}
              >
                {exportSubmitting ? "Submitting…" : "Export My Data"}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void handleDeleteAccount()}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Submitting…" : "Delete My Account"}
              </button>
            </div>
          </section>

          {/* Security section */}
          <section aria-labelledby="security-heading" className={styles.section}>
            <h2 id="security-heading" className={styles.sectionHeading}>Security</h2>
            <div className={styles.securityRow}>
              <span>Password</span>
              <a
                href="#change-password-noop"
                className={styles.securityLink}
                onClick={(e) => e.preventDefault()}
              >
                Change Password
              </a>
            </div>
            <div className={styles.securityRow}>
              <span>Active Sessions</span>
              <a
                href="#view-sessions-noop"
                className={styles.securityLink}
                onClick={(e) => e.preventDefault()}
              >
                View Sessions
              </a>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

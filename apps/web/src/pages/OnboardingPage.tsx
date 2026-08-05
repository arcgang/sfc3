import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./OnboardingPage.module.css";

type DashboardMode = "default" | "fitness" | "chronic_care_aware";

interface PutProfileBody {
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  wellnessPreferences?: string[];
  dashboardMode?: DashboardMode;
}

const WELLNESS_PREFS = [
  { value: "activity", label: "Daily activity and step tracking", id: "pref-activity" },
  { value: "sleep", label: "Sleep quality and duration", id: "pref-sleep" },
  { value: "weight", label: "Weight and body composition", id: "pref-weight" },
  { value: "heart", label: "Heart rate and vital metrics", id: "pref-heart" },
  { value: "goals", label: "Goal setting and progress tracking", id: "pref-goals" },
] as const;

const DASHBOARD_MODES: { value: DashboardMode; title: string; desc: string }[] = [
  {
    value: "default",
    title: "Everyday Wellness",
    desc: "Balanced view across all health domains. Best for general wellness tracking.",
  },
  {
    value: "fitness",
    title: "Active Fitness",
    desc: "Emphasizes activity, workouts, and body composition. Ideal for fitness enthusiasts.",
  },
  {
    value: "chronic_care_aware",
    title: "Assisted / Chronic-Care-Aware",
    desc: "Larger emphasis on critical indicators and simplified readability.",
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("default");
  const [selectedPrefs, setSelectedPrefs] = useState<Set<string>>(
    new Set(["activity", "sleep"]),
  );
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function togglePref(value: string) {
    setSelectedPrefs((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFullNameError(null);

    if (!fullName.trim()) {
      setFullNameError("Full name is required.");
      return;
    }

    setSubmitting(true);

    const body: PutProfileBody = {
      fullName: fullName.trim(),
      wellnessPreferences: Array.from(selectedPrefs),
      dashboardMode,
    };
    if (dateOfBirth) body.dateOfBirth = dateOfBirth;
    if (gender) body.gender = gender;

    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      navigate("/devices/pair");
    } catch {
      setFormError("Could not save your profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    navigate("/devices/pair");
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.logo}>W WellnessHub</p>

        <h1 className={styles.heading}>Welcome to WellnessHub!</h1>
        <p className={styles.subheading}>
          Let's set up your profile to personalize your wellness experience
        </p>

        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {/* Full Name */}
          <div className={styles.field}>
            <label htmlFor="fullName">Full Name *</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-describedby={fullNameError ? "fullName-error" : undefined}
              required
            />
            {fullNameError && (
              <span id="fullName-error" role="alert" className={styles.fieldError}>
                {fullNameError}
              </span>
            )}
          </div>

          {/* Date of Birth */}
          <div className={styles.field}>
            <label htmlFor="dateOfBirth">Date of Birth (Optional)</label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>

          {/* Gender */}
          <div className={styles.field}>
            <label htmlFor="gender">Gender (Optional)</label>
            <select
              id="gender"
              name="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          {/* Dashboard Mode */}
          <div className={styles.modeSection}>
            <p className={styles.modeSectionLabel}>Dashboard Mode *</p>
            <p className={styles.prefsSubLabel}>
              Choose how your dashboard emphasizes health information
            </p>
            <div className={styles.modeOptions} role="radiogroup" aria-label="Dashboard Mode">
              {DASHBOARD_MODES.map((mode) => (
                <label key={mode.value} className={styles.modeOption}>
                  <input
                    type="radio"
                    name="dashboardMode"
                    value={mode.value}
                    checked={dashboardMode === mode.value}
                    onChange={() => setDashboardMode(mode.value)}
                  />
                  <div>
                    <span className={styles.modeOptionTitle}>{mode.title}</span>
                    <p className={styles.modeOptionDesc}>{mode.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Wellness Preferences */}
          <div className={styles.prefsSection}>
            <p className={styles.prefsSectionLabel}>Wellness Preferences</p>
            <p className={styles.prefsSubLabel}>
              Select areas you'd like to focus on
            </p>
            <ul className={styles.prefsList}>
              {WELLNESS_PREFS.map((pref) => (
                <li key={pref.value} className={styles.prefItem}>
                  <input
                    type="checkbox"
                    id={pref.id}
                    name="preferences"
                    value={pref.value}
                    checked={selectedPrefs.has(pref.value)}
                    onChange={() => togglePref(pref.value)}
                  />
                  <label htmlFor={pref.id}>{pref.label}</label>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Next: Connect Devices"}
          </button>
        </form>

        <div className={styles.skipRow}>
          <button
            type="button"
            className={styles.skipButton}
            onClick={handleSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

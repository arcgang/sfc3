import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api.js";
import styles from "./RegisterPage.module.css";

interface RegisterResponse {
  data: { id: string; email: string };
}

interface ApiErrorDetail {
  code: string;
  message: string;
  field: string;
}

interface ApiErrorBody {
  error: { type: string; details: ApiErrorDetail[] };
}

function validateFields(
  fullName: string,
  email: string,
  password: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!fullName.trim()) {
    errors["fullName"] = "Full name is required.";
  }
  if (!email.trim()) {
    errors["email"] = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors["email"] = "Enter a valid email address.";
  }
  if (!password) {
    errors["password"] = "Password is required.";
  } else if (password.length < 8) {
    errors["password"] = "Password must be at least 8 characters.";
  }
  return errors;
}

export function RegisterPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const errors = validateFields(fullName, email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      await apiFetch<RegisterResponse>("/auth/session", {
        method: "POST",
        body: JSON.stringify({ mode: "register", fullName, email, password }),
      });
      navigate("/onboarding");
    } catch (err: unknown) {
      if (err instanceof Error) {
        try {
          const parsed: ApiErrorBody = JSON.parse(err.message);
          if (parsed.error.type === "CONFLICT") {
            const detail = parsed.error.details[0];
            if (detail) {
              setFieldErrors({ email: detail.message });
              return;
            }
          }
          const errors: Record<string, string> = {};
          for (const detail of parsed.error.details) {
            errors[detail.field ?? "form"] = detail.message;
          }
          if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
          } else {
            setFormError(err.message || "Registration failed. Please try again.");
          }
        } catch {
          setFormError(err.message || "Registration failed. Please try again.");
        }
      } else {
        setFormError("Registration failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.logo}>W WellnessHub</p>

        <h1 className={styles.heading}>Create your account</h1>
        <p className={styles.subheading}>
          Sign up to start tracking your wellness journey
        </p>

        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-describedby={fieldErrors["fullName"] ? "fullName-error" : undefined}
              required
            />
            {fieldErrors["fullName"] && (
              <span id="fullName-error" role="alert" className={styles.fieldError}>
                {fieldErrors["fullName"]}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={fieldErrors["email"] ? "email-error" : undefined}
              required
            />
            {fieldErrors["email"] && (
              <span id="email-error" role="alert" className={styles.fieldError}>
                {fieldErrors["email"]}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={fieldErrors["password"] ? "password-error" : undefined}
              required
            />
            {fieldErrors["password"] && (
              <span id="password-error" role="alert" className={styles.fieldError}>
                {fieldErrors["password"]}
              </span>
            )}
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className={styles.securityNote}>
          <span aria-hidden="true">🔒</span>
          Your session is secure and encrypted.
        </p>

        <p className={styles.signInRow}>
          {"Already have an account? "}
          <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}

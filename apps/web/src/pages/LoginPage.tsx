import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import styles from "./LoginPage.module.css";

const EXPIRES_AT_KEY = "expiresAt";

interface LoginResponse {
  data: {
    accessToken: string;
    expiresAt: string;
    user: { id: string; email: string };
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    let valid = true;
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);

    if (!email.trim()) {
      setEmailError("Email address is required.");
      valid = false;
    }
    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>("/auth/session", {
        method: "POST",
        body: JSON.stringify({ mode: "login", email: email.trim(), password }),
      });
      login(res.data.accessToken);
      setToken(res.data.accessToken);
      try {
        localStorage.setItem(EXPIRES_AT_KEY, res.data.expiresAt);
      } catch {
        // storage unavailable
      }
      navigate("/dashboard", { replace: true });
    } catch {
      setFormError("Invalid email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>W</div>
          <span className={styles.logoText}>WellnessHub</span>
        </div>

        <div className={styles.loginHeader}>
          <h1 className={styles.heading}>Welcome back</h1>
          <p className={styles.subheading}>
            Log in to access your wellness dashboard
          </p>
        </div>

        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <span id="email-error" role="alert" className={styles.fieldError}>
                {emailError}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={passwordError ? "password-error" : undefined}
            />
            {passwordError && (
              <span id="password-error" role="alert" className={styles.fieldError}>
                {passwordError}
              </span>
            )}
            <div className={styles.forgotRow}>
              <a
                href="#forgot-password-noop"
                className={styles.forgotLink}
                onClick={(e) => e.preventDefault()}
              >
                Forgot password?
              </a>
            </div>
          </div>

          <button type="submit" className={styles.submitButton} disabled={submitting}>
            {submitting ? "Logging in…" : "Log In"}
          </button>
        </form>

        <p className={styles.securityNote}>
          <span aria-hidden="true">🔒</span>
          Your session is secure and encrypted.
        </p>

        <div className={styles.divider}>
          <span className={styles.dividerText}>New to WellnessHub?</span>
        </div>

        <p className={styles.signUpRow}>
          {"Don't have an account? "}
          <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

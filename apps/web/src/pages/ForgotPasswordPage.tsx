import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";
import styles from "./ForgotPasswordPage.module.css";

interface PasswordResetResponse {
  data: { message: string };
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    setRequestError(null);

    if (!email.trim()) {
      setEmailError("Email address is required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch<PasswordResetResponse>("/auth/session", {
        method: "POST",
        body: JSON.stringify({ mode: "password_reset_request", email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setRequestError("Something went wrong. Please try again.");
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

        <div className={styles.header}>
          <h1 className={styles.heading}>Reset your password</h1>
          <p className={styles.subheading}>
            Enter your email address and we&apos;ll send you instructions to reset your password.
          </p>
        </div>

        {submitted ? (
          <p role="status" className={styles.successMessage}>
            If the account exists, password reset instructions have been sent.
          </p>
        ) : (
          <>
            {requestError && (
              <p role="alert" className={styles.formError}>
                {requestError}
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

              <button type="submit" className={styles.submitButton} disabled={submitting}>
                {submitting ? "Sending…" : "Send reset instructions"}
              </button>
            </form>
          </>
        )}

        <div className={styles.backRow}>
          <Link to="/login" className={styles.backLink}>
            ← Back to log in
          </Link>
        </div>
      </div>
    </div>
  );
}

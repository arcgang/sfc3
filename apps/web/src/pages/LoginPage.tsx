import { Link } from "react-router-dom";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.logo}>W WellnessHub</p>

        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.subheading}>
          Log in to access your wellness dashboard
        </p>

        <form className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
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
            />
          </div>

          <div className={styles.forgotRow}>
            <a
              href="#forgot-password-noop"
              className={styles.forgotLink}
              onClick={(e) => e.preventDefault()}
            >
              Forgot password?
            </a>
          </div>

          <button type="submit" className={styles.submitButton}>
            Log In
          </button>
        </form>

        <p className={styles.securityNote}>
          <span aria-hidden="true">🔒</span>
          Your session is secure and encrypted.
        </p>

        <p className={styles.signUpRow}>
          {"New to WellnessHub? Don't have an account? "}
          <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

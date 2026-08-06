import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import styles from "./Layout.module.css";

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon} aria-hidden="true">W</div>
          <span className={styles.brandName}>WellnessHub</span>
        </div>
        <nav aria-label="Sidebar navigation" className={styles.nav}>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.navLinkActive : styles.navLink}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/my-account" className={({ isActive }) => isActive ? styles.navLinkActive : styles.navLink}>
            👤 My Account
          </NavLink>
          <NavLink to="/partners-services" className={({ isActive }) => isActive ? styles.navLinkActive : styles.navLink}>
            🤝 Partners &amp; Services
          </NavLink>
        </nav>
        <div className={styles.userBlock}>
          <div className={styles.userProfile}>
            <div className={styles.userAvatar} aria-hidden="true">A</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>Alex Johnson</div>
              <div className={styles.userEmail}>alex@example.com</div>
            </div>
          </div>
          <a
            href="/login"
            className={styles.logoutLink}
            onClick={(e) => {
              e.preventDefault();
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Log out
          </a>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

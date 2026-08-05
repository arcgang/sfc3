import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import styles from "./Layout.module.css";

export function AppLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span aria-hidden="true">W</span>
          <strong>WellnessHub</strong>
        </div>
        <nav aria-label="Sidebar navigation" className={styles.nav}>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive ? styles.navLinkActive : styles.navLink
            }
          >
            📊 Dashboard
          </NavLink>
          <NavLink
            to="/my-account"
            className={({ isActive }) =>
              isActive ? styles.navLinkActive : styles.navLink
            }
          >
            👤 My Account
          </NavLink>
          <NavLink
            to="/partners-services"
            className={({ isActive }) =>
              isActive ? styles.navLinkActive : styles.navLink
            }
          >
            🤝 Partners &amp; Services
          </NavLink>
        </nav>
        <div className={styles.userBlock}>
          <span aria-hidden="true" className={styles.userAvatar}>A</span>
          <span className={styles.userName}>Alex Johnson</span>
          <span className={styles.userEmail}>alex@example.com</span>
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

import { NavLink, Outlet, Link } from "react-router-dom";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span aria-hidden="true">W</span>
          <strong>WellnessHub</strong>
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
          <span aria-hidden="true" className={styles.userAvatar}>A</span>
          <span className={styles.userName}>Alex Johnson</span>
          <span className={styles.userEmail}>alex@example.com</span>
          <Link to="/logout" className={styles.logoutLink}>Log out</Link>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

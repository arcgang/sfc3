import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <div className={styles.logo}>
          <span aria-hidden="true" className={styles.logoIcon}>W</span>
          <span>WellnessHub</span>
        </div>
        <nav aria-label="Footer navigation" className={styles.footerLinks}>
          <Link to="/privacy" className={styles.footerLink}>Privacy Policy</Link>
          <Link to="/terms" className={styles.footerLink}>Terms of Service</Link>
          <Link to="/contact" className={styles.footerLink}>Contact</Link>
        </nav>
      </div>
    </footer>
  );
}

import { Link } from "react-router-dom";

/* text: #111111 on background: #ffffff — contrast ratio ≈ 18.1:1, well above WCAG AA 4.5:1 */
export function Footer() {
  return (
    <footer style={{ color: "#111111", backgroundColor: "#ffffff" }}>
      <span aria-hidden="true">W</span>
      <strong>WellnessHub</strong>
      <nav aria-label="Footer navigation">
        <Link to="/privacy" style={{ color: "inherit" }}>Privacy Policy</Link>
        <Link to="/terms" style={{ color: "inherit" }}>Terms of Service</Link>
        <Link to="/contact" style={{ color: "inherit" }}>Contact</Link>
      </nav>
    </footer>
  );
}

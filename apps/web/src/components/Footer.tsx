import { Link } from "react-router-dom";

/* text: #111 on background: #fff — contrast ratio ≈ 18.1:1, well above WCAG AA 4.5:1 */
export function Footer() {
  return (
    <footer>
      <span aria-hidden="true">W</span>
      <strong>WellnessHub</strong>
      <nav aria-label="Footer navigation">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
        <Link to="/contact">Contact</Link>
      </nav>
    </footer>
  );
}

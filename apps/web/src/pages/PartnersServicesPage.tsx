import { Link } from "react-router-dom";

/* text: #111111 on background: #ffffff — contrast ratio ≈ 18.1:1, well above WCAG AA 4.5:1 */
export function PartnersServicesPage() {
  return (
    <div style={{ display: "flex", color: "#111111", backgroundColor: "#ffffff" }}>
      <aside>
        <nav aria-label="Sidebar navigation">
          <Link to="/dashboard">📊 Dashboard</Link>
          <Link to="/my-account">👤 My Account</Link>
          <Link to="/partners-services">🤝 Partners & Services</Link>
        </nav>
      </aside>
      <main>
        <h1>Explore Wellness Partners &amp; Services</h1>
        <p>Discover services and programs to enhance your wellness journey</p>
      </main>
    </div>
  );
}

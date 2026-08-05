import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.js";
import { PartnersServicesPage } from "./PartnersServicesPage.js";

function renderPartnersServicesPage() {
  return render(
    <MemoryRouter>
      <PartnersServicesPage />
    </MemoryRouter>,
  );
}

function renderViaApp(path = "/partners-services") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

// ── Route registration ────────────────────────────────────────────────────────

test("/partners-services route renders the Partners & Services page heading", () => {
  renderViaApp("/partners-services");
  screen.getByRole("heading", {
    name: /Explore Wellness Partners & Services/i,
    level: 1,
  });
});

// ── Sidebar navigation ────────────────────────────────────────────────────────

test("Partners & Services page renders the '🤝 Partners & Services' sidebar nav link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "🤝 Partners & Services" });
});

test("'🤝 Partners & Services' sidebar nav link points to /partners-services", () => {
  renderPartnersServicesPage();
  const link = screen.getByRole("link", { name: "🤝 Partners & Services" });
  expect(link.getAttribute("href")).toBe("/partners-services");
});

test("sidebar nav contains Dashboard link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "📊 Dashboard" });
});

test("sidebar nav contains My Account link", () => {
  renderPartnersServicesPage();
  screen.getByRole("link", { name: "👤 My Account" });
});

// ── Page heading ──────────────────────────────────────────────────────────────

test("Partners & Services page renders a level-1 heading with the spec text", () => {
  renderPartnersServicesPage();
  screen.getByRole("heading", {
    name: "Explore Wellness Partners & Services",
    level: 1,
  });
});

import { Route, Routes, useLocation } from "react-router-dom";
import { Footer } from "./components/Footer.js";
import { Layout } from "./components/Layout.js";
import { ContactPage } from "./pages/ContactPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { GoalsProgressPage } from "./pages/GoalsProgressPage.js";
import { HomePage } from "./pages/HomePage";
import { PartnersServicesPage } from "./pages/PartnersServicesPage.js";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

function Placeholder() {
  return (
    <main>
      <h1>Web</h1>
      <p>App shell. Replace this with real features.</p>
    </main>
  );
}

function DevicesPairPlaceholder() {
  return (
    <main>
      <h1>Connect Your Devices</h1>
      <p>Device pairing coming soon.</p>
    </main>
  );
}

function DevicesPlaceholder() {
  return (
    <main>
      <h1>Connected Devices</h1>
      <p>Connected devices coming soon.</p>
    </main>
  );
}

export function App() {
  const { pathname } = useLocation();
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/partners-services" element={<PartnersServicesPage />} />
        <Route path="/devices/pair" element={<DevicesPairPlaceholder />} />
        <Route path="/devices" element={<DevicesPlaceholder />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/goals" element={<GoalsProgressPage />} />
        </Route>
        <Route path="*" element={<Placeholder />} />
      </Routes>
      {pathname !== "/" && <Footer />}
    </>
  );
}

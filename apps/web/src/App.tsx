import { Navigate, Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer.js";
import { Layout } from "./components/Layout.js";
import { ContactPage } from "./pages/ContactPage.js";
import { ConnectedDevicesPage } from "./pages/ConnectedDevicesPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DevicePairingPage } from "./pages/DevicePairingPage.js";
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

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/partners-services" element={<PartnersServicesPage />} />
        <Route path="/onboarding/devices" element={<Navigate to="/devices/pair" replace />} />
        <Route path="/devices/pair" element={<DevicePairingPage />} />
        <Route path="/devices" element={<ConnectedDevicesPage />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/goals" element={<GoalsProgressPage />} />
        </Route>
        <Route path="*" element={<Placeholder />} />
      </Routes>
      <Footer />
    </>
  );
}

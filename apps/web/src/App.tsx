<<<<<<< HEAD
import { Navigate, Route, Routes } from "react-router-dom";
=======
import { Route, Routes } from "react-router-dom";
import { ConnectedDevicesPage } from "./pages/ConnectedDevicesPage.js";
>>>>>>> origin/main
import { Footer } from "./components/Footer.js";
import { Layout } from "./components/Layout.js";
import { AlertsPage } from "./pages/AlertsPage.js";
import { ContactPage } from "./pages/ContactPage.js";
<<<<<<< HEAD
import { ConnectedDevicesPage } from "./pages/ConnectedDevicesPage.js";
=======
import { DevicePairingPage } from "./pages/DevicePairingPage.js";
>>>>>>> origin/main
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

<<<<<<< HEAD
=======
function DevicesPlaceholder() {
  return (
    <main>
      <h1>Connected Devices</h1>
      <p>Connected devices coming soon.</p>
    </main>
  );
}

function OnboardingDevicesPlaceholder() {
  return (
    <main>
      <h1>Connect Your Devices</h1>
      <p>Onboarding device setup coming soon.</p>
    </main>
  );
}

>>>>>>> origin/main
export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/partners-services" element={<PartnersServicesPage />} />
<<<<<<< HEAD
        <Route path="/onboarding/devices" element={<Navigate to="/devices/pair" replace />} />
        <Route path="/devices/pair" element={<DevicePairingPage />} />
        <Route path="/devices" element={<ConnectedDevicesPage />} />
=======
        <Route path="/devices/pair" element={<DevicePairingPage />} />
        <Route path="/onboarding/devices" element={<OnboardingDevicesPlaceholder />} />
        <Route path="/devices/pair" element={<DevicesPairPlaceholder />} />
        <Route path="/devices" element={<DevicesPlaceholder />} />
>>>>>>> origin/main
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/goals" element={<GoalsProgressPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
        </Route>
        <Route path="*" element={<Placeholder />} />
      </Routes>
      <Footer />
    </>
  );
}

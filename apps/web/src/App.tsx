import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.js";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout.js";
import { ConnectedDevicesPage } from "./pages/ConnectedDevicesPage.js";
import { Footer } from "./components/Footer.js";
import { Layout } from "./components/Layout.js";
import { AlertsPage } from "./pages/AlertsPage.js";
import { ContactPage } from "./pages/ContactPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DevicePairingPage } from "./pages/DevicePairingPage.js";
import { GoalsProgressPage } from "./pages/GoalsProgressPage.js";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { PartnersServicesPage } from "./pages/PartnersServicesPage.js";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { RegisterPage } from "./pages/RegisterPage.js";

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
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/partners-services" element={<PartnersServicesPage />} />
        <Route path="/onboarding/devices" element={<Navigate to="/devices/pair" replace />} />
        <Route path="/devices/pair" element={<DevicePairingPage />} />
        <Route element={<AuthenticatedLayout />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/goals" element={<GoalsProgressPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/devices" element={<ConnectedDevicesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Placeholder />} />
      </Routes>
      <Footer />
    </AuthProvider>
  );
}

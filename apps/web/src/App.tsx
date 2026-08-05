import { Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer.js";
import { ContactPage } from "./pages/ContactPage.js";
import { DevicePairingPage } from "./pages/DevicePairingPage.js";
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

function DevicesPlaceholder() {
  return (
    <main>
      <h1>Connected Devices</h1>
      <p>Connected devices coming soon.</p>
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
        <Route path="/devices/pair" element={<DevicePairingPage />} />
        <Route path="/devices" element={<DevicesPlaceholder />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
      <Footer />
    </>
  );
}
